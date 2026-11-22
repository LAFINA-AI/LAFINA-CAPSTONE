/* Generate documentation from the real, fully migrated, empty SQLite schema.
 * No application database, native module, account, or network is accessed.
 * node scripts/generate-erd.cjs [--check] [--render]
 * --render additionally needs @viz-js/viz and sharp (resolvable via NODE_PATH).
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createHash} = require('node:crypto');
const {DatabaseSync} = require('node:sqlite');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'docs/architecture');
const cache = new Map();

// Transpile only the schema's local dependency tree; keep native RN imports out.
function loadSchemaModule(filename) {
  filename = path.resolve(filename);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = {exports: {}};
  cache.set(filename, module);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const localRequire = specifier => {
    if (specifier === './database') {
      return {
        db: undefined,
        StorageUnavailableError: class extends Error {},
        storageErrorMessage: error => String(error),
      };
    }
    if (!specifier.startsWith('.'))
      throw new Error(`Unexpected schema dependency: ${specifier}`);
    return loadSchemaModule(
      path.resolve(path.dirname(filename), `${specifier}.ts`),
    );
  };
  vm.runInThisContext(`(function(require,module,exports){${compiled}\n})`, {
    filename,
  })(localRequire, module, module.exports);
  return module.exports;
}

async function inspectSchema() {
  const sqlite = new DatabaseSync(':memory:');
  const executeSync = (sql, params = []) => {
    const statement = sqlite.prepare(sql);
    if (
      /^\s*(SELECT|PRAGMA)\b/i.test(sql) &&
      !/^\s*PRAGMA\s+\w+\s*=/i.test(sql)
    ) {
      return {rows: statement.all(...params), rowsAffected: 0};
    }
    const result = statement.run(...params);
    return {rows: [], rowsAffected: Number(result.changes)};
  };
  const service = {
    executeSync,
    isFallback: () => false,
    getHealth: () => ({status: 'ready', reason: null}),
    requireRecovery: reason => {
      throw new Error(`Schema migration failed: ${reason}`);
    },
    transactionSync: callback => {
      sqlite.exec('BEGIN');
      try {
        const result = callback({executeSync});
        sqlite.exec('COMMIT');
        return result;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  try {
    const {initDatabase, CURRENT_SCHEMA_VERSION} = loadSchemaModule(
      path.join(root, 'src/storage/dbInit.ts'),
    );
    await initDatabase(service);
    const tables = sqlite
      .prepare('PRAGMA table_list')
      .all()
      .filter(
        t =>
          t.schema === 'main' &&
          ['table', 'virtual'].includes(t.type) &&
          !t.name.startsWith('sqlite_'),
      )
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(table => {
        const name = table.name;
        const quote = value => `'${value.replaceAll("'", "''")}'`;
        const indexes = sqlite
          .prepare(`PRAGMA index_list(${quote(name)})`)
          .all()
          .map(index => ({
            name: index.name,
            unique: Boolean(index.unique),
            origin: index.origin,
            partial: Boolean(index.partial),
            columns: sqlite
              .prepare(`PRAGMA index_info(${quote(index.name)})`)
              .all()
              .map(c => c.name),
            sql:
              sqlite
                .prepare('SELECT sql FROM sqlite_schema WHERE name = ?')
                .get(index.name)?.sql ?? null,
          }))
          .sort((a, b) => a.name.localeCompare(b.name));
        return {
          name,
          kind: table.type,
          columns: sqlite
            .prepare(`PRAGMA table_info(${quote(name)})`)
            .all()
            .map(c => ({
              name: c.name,
              type: c.type,
              notNull: Boolean(c.notnull),
              primaryKeyOrder: c.pk,
              default: c.dflt_value,
            })),
          foreignKeys: sqlite
            .prepare(`PRAGMA foreign_key_list(${quote(name)})`)
            .all(),
          indexes,
          sql: sqlite
            .prepare('SELECT sql FROM sqlite_schema WHERE name = ?')
            .get(name).sql,
        };
      });
    if (!tables.some(t => t.name === 'handbook_chunks_fts'))
      throw new Error('FTS5 was not created; refuse incomplete ERD.');
    if (sqlite.prepare('PRAGMA foreign_key_check').all().length)
      throw new Error('Foreign-key check failed.');
    const integrity = sqlite.prepare('PRAGMA integrity_check').get();
    if (Object.values(integrity)[0] !== 'ok')
      throw new Error('SQLite integrity check failed.');
    return {schemaVersion: CURRENT_SCHEMA_VERSION, tables};
  } finally {
    sqlite.close();
  }
}

const escape = value =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

// These are application/trigger references, NOT SQL foreign keys. Audit evidence
// and cleanup records can outlive their targets, so no FK cardinality is implied.
const logicalReferences = [
  [
    'notes_search_index',
    'note_id',
    'notes',
    'id',
    'Revision-stamped search cache; invalidation triggers.',
  ],
  [
    'event_time_local',
    'event_id',
    'events',
    'id',
    'Optional local time metadata; invalidation/owner triggers.',
  ],
  [
    'reminder_delivery_jobs',
    'reminder_id',
    'reminders',
    'id',
    'Trigger-maintained delivery state; retired rows can survive hard deletion.',
  ],
  [
    'reminder_delivery_events',
    'reminder_id',
    'reminders',
    'id',
    'Bounded delivery audit history; may outlive the reminder.',
  ],
  [
    'reminder_delivery_styles',
    'reminder_id',
    'reminders',
    'id',
    'Optional local style; absence means call; cleanup triggers.',
  ],
  [
    'job_queue_items',
    'reminder_id',
    'reminders',
    'id',
    'Nullable queue reference; no SQL FK.',
  ],
  [
    'alarms',
    'source_reminder_id',
    'reminders',
    'id',
    'Nullable migration provenance; not a unique association.',
  ],
  [
    'chat_memories',
    'session_id',
    'chat_sessions',
    'id',
    'Nullable source-session provenance; no SQL FK.',
  ],
  [
    'chat_legacy_quarantine',
    'session_id',
    'chat_sessions',
    'id',
    'Quarantine record for legacy session; no SQL FK.',
  ],
  [
    'chat_legacy_quarantine',
    'recorded_owner',
    'users',
    'id',
    'Historical owner can be absent or ambiguous.',
  ],
  [
    'assistant_operation_receipts',
    'reminder_id',
    'reminders',
    'id',
    'Nullable historical result reference.',
  ],
];

const groups = [
  [
    'Identity & preferences',
    [
      'users',
      'user_preferences',
      'active_session',
      'remember_me',
      'local_settings',
      'custom_categories',
    ],
  ],
  [
    'Personal planner',
    [
      'tasks',
      'events',
      'time_blocks',
      'notes',
      'reminders',
      'event_time_local',
    ],
  ],
  [
    'Conversations & files',
    [
      'chat_sessions',
      'messages',
      'chat_memories',
      'chat_legacy_quarantine',
      'recorded_meetings',
      'attachment_cleanup',
    ],
  ],
  [
    'Alerts & local search',
    [
      'reminder_delivery_jobs',
      'reminder_delivery_events',
      'reminder_delivery_styles',
      'alarms',
      'job_queue_items',
      'notes_search_index',
    ],
  ],
  [
    'Sync & revisions',
    [
      'sync_outbox',
      'sync_metadata',
      'sync_state',
      'sync_control',
      'sync_conflicts',
      'entity_local_revisions',
    ],
  ],
  [
    'Assistant & handbook',
    [
      'assistant_operation_receipts',
      'user_behavior_logs',
      'ml_feature_snapshots',
      'handbook_meta',
      'handbook_chunks',
      'handbook_chunks_fts',
    ],
  ],
];

function referencesFor(schema) {
  const refs = [...logicalReferences];
  for (const table of schema.tables) {
    if (
      table.columns.some(c => c.name === 'user_id') &&
      !table.foreignKeys.some(fk => fk.from === 'user_id')
    ) {
      refs.push([
        table.name,
        'user_id',
        'users',
        'id',
        'Application ownership/scope; no SQL FK. Cleanup obligations may survive owner deletion.',
      ]);
    }
  }
  return refs;
}

function validateDiagram(schema, refs) {
  const names = groups.flatMap(([, tables]) => tables);
  if (
    new Set(names).size !== names.length ||
    names.length !== schema.tables.length ||
    schema.tables.some(t => !names.includes(t.name))
  ) {
    throw new Error(
      'ERD groups must cover every application table exactly once.',
    );
  }
  for (const [child, column, parent, target] of refs) {
    for (const [table, field] of [
      [child, column],
      [parent, target],
    ]) {
      if (
        !schema.tables
          .find(t => t.name === table)
          ?.columns.some(c => c.name === field)
      ) {
        throw new Error(`Unknown ERD endpoint: ${table}.${field}`);
      }
    }
  }
}

function tableDot(table, refs) {
  const rows = table.columns.map(column => {
    const keys = [];
    if (column.primaryKeyOrder)
      keys.push(
        `PK${
          table.columns.filter(c => c.primaryKeyOrder).length > 1
            ? column.primaryKeyOrder
            : ''
        }`,
      );
    if (table.foreignKeys.some(fk => fk.from === column.name)) keys.push('FK');
    if (
      table.indexes.some(
        i =>
          i.unique &&
          i.origin !== 'pk' &&
          i.columns.length === 1 &&
          i.columns[0] === column.name,
      )
    )
      keys.push('UQ');
    if (refs.some(r => r[0] === table.name && r[1] === column.name))
      keys.push('LR');
    if (
      ([
        'sync_outbox',
        'sync_metadata',
        'sync_conflicts',
        'entity_local_revisions',
        'assistant_operation_receipts',
      ].includes(table.name) &&
        ['entity_type', 'entity_id'].includes(column.name)) ||
      (table.name === 'reminder_delivery_jobs' &&
        ['source_type', 'source_id'].includes(column.name))
    ) {
      keys.push('PR');
    }
    return `<TR><TD PORT="${column.name}_w" ALIGN="LEFT">${
      keys.join(', ') || ' '
    }</TD><TD ALIGN="LEFT">${column.name}</TD><TD PORT="${
      column.name
    }_e" ALIGN="LEFT">${column.type || 'untyped'}${
      column.notNull ? ' NN' : ''
    }</TD></TR>`;
  });
  const subtitle = table.kind === 'virtual' ? ' (FTS5 virtual)' : '';
  return `"${
    table.name
  }" [label=<<TABLE BORDER="1" CELLBORDER="1" CELLSPACING="0" CELLPADDING="5" COLOR="#8b9199"><TR><TD COLSPAN="3" BGCOLOR="#eef0f2"><B>${
    table.name
  }${subtitle}</B></TD></TR><TR><TD><B>Key</B></TD><TD><B>Column</B></TD><TD><B>SQLite type</B></TD></TR>${rows.join(
    '',
  )}</TABLE>>];`;
}

function createDot(schema, refs) {
  const parts = [
    'digraph LAFINA {',
    'graph [rankdir=LR, bgcolor="white", pad=0.5, nodesep=0.5, ranksep=1.4, splines=spline, outputorder=edgesfirst, fontname="Arial", fontsize=22, labelloc=t, labeljust=l];',
    `label="LAFINA — Local database ERD (schema ${schema.schemaVersion})\\l${schema.tables.length} application tables | all declared columns | Android lafina.db\\l\\lPK / PK1..n = primary key | FK = declared foreign key | UQ = single-column unique key\\lNN = explicit NOT NULL | LR = logical reference | PR = polymorphic reference (neither is an FK)\\lSolid crow's-foot = SQL FK (one parent; zero or one / many children). Dashed arrow = logical reference only.\\lRepeated user_id LR lines are omitted: each refers to users.id. See the companion schema guide for constraints and polymorphic links.\\l";`,
    'node [shape=plain, fontname="Arial", fontsize=11];',
    'edge [fontname="Arial", fontsize=9, color="#66717e", arrowsize=0.8];',
  ];
  groups.forEach(([title, tables], index) => {
    parts.push(
      `subgraph cluster_${index} { label="${escape(
        title,
      )}"; fontsize=18; color="#c8cdd3"; margin=20;`,
    );
    parts.push(`{rank=same; ${tables.map(name => `"${name}"`).join(';')};}`);
    tables.forEach(name =>
      parts.push(
        tableDot(
          schema.tables.find(t => t.name === name),
          refs,
        ),
      ),
    );
    // Invisible edges preserve a stable reading order within each column.
    parts.push(
      `${[...tables]
        .reverse()
        .map(name => `"${name}"`)
        .join(' -> ')} [style=invis, weight=100];`,
    );
    parts.push('}');
  });
  parts.push(
    `${groups
      .map(([, tables]) => `"${tables[0]}"`)
      .join(' -> ')} [style=invis, weight=100];`,
  );
  for (const table of schema.tables) {
    for (const fk of table.foreignKeys) {
      const unique =
        table.columns.some(
          c =>
            c.name === fk.from &&
            c.primaryKeyOrder &&
            table.columns.filter(p => p.primaryKeyOrder).length === 1,
        ) ||
        table.indexes.some(
          i => i.unique && i.columns.length === 1 && i.columns[0] === fk.from,
        );
      parts.push(
        `"${fk.table}":${fk.to}_e:e -> "${table.name}":${
          fk.from
        }_w:w [constraint=false, color="#20252b", penwidth=1.5, dir=both, arrowtail=teetee, arrowhead=${
          unique ? 'teeodot' : 'crowodot'
        }];`,
      );
    }
  }
  for (const [child, column, parent, target] of refs) {
    if (
      column === 'user_id' ||
      column === 'recorded_owner' ||
      child === 'assistant_operation_receipts'
    )
      continue;
    parts.push(
      `"${child}":${column}_w:w -> "${parent}":${target}_e:e [constraint=false, style=dashed, color="#8d949e", arrowhead=vee];`,
    );
  }
  // FTS is an external-content index, not a foreign-key relationship.
  parts.push(
    '"handbook_chunks_fts" -> "handbook_chunks" [constraint=false, style=dotted, arrowhead=vee, color="#8d949e"];',
  );
  parts.push('}');
  return `${parts.join('\n')}\n`;
}

function createGuide(schema, refs) {
  const columnCount = schema.tables.reduce((n, t) => n + t.columns.length, 0);
  const lines = [
    '# LAFINA entity–relationship diagram',
    '',
    `This documents the **implemented Android local database, \`lafina.db\`, schema version ${schema.schemaVersion}**: ${schema.tables.length} application tables (35 ordinary tables and one FTS5 virtual table), ${columnCount} declared columns, and three declared foreign keys. It is derived from this checkout, not a proposed design.`,
    '',
    '[![LAFINA local database ERD](lafina-erd.png)](lafina-erd.svg)',
    '',
    'Open the SVG to zoom into individual columns. The table style follows the supplied reference: names, keys, typed attributes, and relationship connectors on a white background.',
    '',
    '## Scope and notation',
    '',
    '- **PK / PK1…n**: primary key; numbers show the order within a composite key. **FK**: a SQL-declared foreign key. **UQ**: a single-column unique constraint/index. Full composite keys and indexes are retained in the schema snapshot.',
    '- **NN** means an explicit `NOT NULL` declaration reported by `PRAGMA table_info`. Absence of NN is not a guarantee that a key accepts NULL: an `INTEGER PRIMARY KEY` is the rowid alias. SQLite also permits NULL in some non-integer primary keys without explicit `NOT NULL` (for example `active_session.user_id`, `job_queue_items.id`, and `recorded_meetings.id`).',
    '- **Solid crow’s-foot connectors** show the three declared SQL FKs. A user can have zero or one preference row and zero or many recorded meetings; a chat session can have zero or many messages. Each FK-bearing row references one existing parent when foreign-key enforcement is enabled, as `initDatabase` configures.',
    '- **LR / dashed arrows** identify logical references handled by application code or triggers. **PR** marks a polymorphic type/ID pair whose target depends on the type. Neither is a SQL FK or guarantees a live parent or cascading deletion. For readability, repeated `user_id → users.id` lines are represented by LR on the column. Historical references can outlive their targets.',
    '- Every declared column is shown. Defaults, CHECK expressions, indexes, and exact DDL appear in the generated catalog below and the [machine-readable snapshot](lafina-schema.json). The generic SQLite rowid and hidden FTS5 control columns are not declared application columns. FTS5 shadow tables and `sqlite_sequence` are implementation internals and are excluded.',
    '- The FTS5 virtual table has untyped declared fields. Its dotted link indicates an external-content index over `handbook_chunks` using rowid, not an FK. FTS5 is optional at runtime: builds lacking it retain the two ordinary handbook tables.',
    '- Cloud authentication, subscriptions, server storage, external providers, and separately maintained Electron storage are outside this physical ERD. No unverified PostgreSQL tables or relationships are inferred from API payloads.',
    '',
    '## Important data semantics',
    '',
    '- The seven core sync entity types are `profile`, `task`, `event`, `time_block`, `reminder`, `note`, and `custom_category`. `profile` is a wire entity assembled from local user/preferences data; there is no local `profile` table. The sync stores and local support tables are not additional synchronized entity types.',
    '- `reminders.task` is human-readable reminder text, **not** `tasks.id`. A standalone reminder need not have a planner source. Explicit source identity is stored in `reminder_delivery_jobs.(source_type, source_id)` for a task, event, or time block; strict legacy inference may find a source without storing a link.',
    '- `tasks.category`, `notes.category`, and `time_blocks.category` are text labels, not `custom_categories.id` foreign keys. Built-in categories can exist without custom-category rows. Notes category renaming updates matching owner/name labels in application code.',
    '- `events.linked_calendar_block` is not an FK to `time_blocks`; current calendar code also uses group markers such as `group:birthdays`.',
    '- `entity_local_revisions.(entity_type, entity_id)` refers polymorphically to tasks, events, time blocks, notes, or reminders. Revision rows can remain after deletion. The sync stores use `entity_type` and `entity_id` for the seven wire types, qualified by owner and account scope. `scope_id` is not a separate local scope table.',
    '- `assistant_operation_receipts.(entity_type, entity_id)` is historical operation-result metadata, not a normal FK. Its nullable `reminder_id` is likewise a historical reference.',
    "- `remember_me` is constrained to singleton key `id = 1`; `handbook_meta` to `id = 'active'`. There is no `handbook_meta_id` column on handbook chunks: the active corpus is managed by the store. Do not infer a relational FK between those tables.",
    '- Reminder delivery jobs may survive hard deletion as retired rows; delivery events are retained as bounded audit history. Notes search and event-time metadata use invalidation triggers; reminder delivery styles are removed by reminder deletion/tombstone triggers.',
    '- `local_settings.value` stores settings/feature payloads under `(user_id, key)`. JSON content such as attachments, transcripts, tags, and sync payloads does not create additional SQL tables. Audio and generated document files are referenced by paths/JSON rather than modeled as invented file tables.',
    '',
    '## Declared SQL foreign keys',
    '',
    '| Child column | Parent column | Child rows per parent | ON DELETE |',
    '| --- | --- | --- | --- |',
  ];
  for (const table of schema.tables)
    for (const fk of table.foreignKeys) {
      lines.push(
        `| \`${table.name}.${fk.from}\` | \`${fk.table}.${fk.to}\` | ${
          table.name === 'user_preferences' ? '0..1' : '0..many'
        } | ${fk.on_delete} |`,
      );
    }
  lines.push(
    '',
    '## Logical reference inventory',
    '',
    'These references are useful for navigating the schema; they do not add database constraints. Polymorphic references are described above.',
    '',
    '| Child column | Referenced column | Meaning |',
    '| --- | --- | --- |',
  );
  for (const [child, column, parent, target, meaning] of refs)
    lines.push(
      `| \`${child}.${column}\` | \`${parent}.${target}\` | ${meaning} |`,
    );
  lines.push(
    '',
    '## Reproduce and verify',
    '',
    'The generator transpiles only schema modules, runs the actual baseline and migrations in an empty in-memory Node SQLite database, and inspects `table_list`, `table_info`, `foreign_key_list`, and indexes. It also runs SQLite integrity/foreign-key checks. It never opens a student database or loads native React Native modules.',
    '',
    '```powershell',
    '# Regenerate JSON snapshot, schema guide, and editable Graphviz source:',
    'node scripts/generate-erd.cjs',
    '# Compare the live migrated schema and generated text artifacts with the checked-in versions:',
    'node scripts/generate-erd.cjs --check',
    '# Also render SVG and PNG (requires @viz-js/viz and sharp; NODE_PATH may point to bundled packages):',
    'node scripts/generate-erd.cjs --render',
    '```',
    '',
    'Source: [baseline and migration sequence](../../src/storage/dbInit.ts), the schema modules it imports, [source reminder resolution](../../src/storage/sourceReminders.ts), [sync types](../../src/storage/syncTypes.ts), [profile payload](../../src/storage/profileSyncPayload.ts), [category handling](../../src/storage/notesStore.ts), and [calendar grouping](../../src/storage/scheduleEntriesStore.ts).',
    '',
    '## Exact table catalog',
    '',
    'The following SQL is read back from SQLite after all migrations. It preserves CHECK constraints, defaults, column order, FK actions, and nullable declarations. Index definitions follow each table; the JSON snapshot also records index origin and uniqueness.',
    '',
  );
  for (const table of schema.tables) {
    lines.push(`### ${table.name}`, '', '```sql', `${table.sql};`, '```', '');
    if (table.indexes.length) {
      lines.push(
        '| Index | Unique | Columns (in key order) |',
        '| --- | --- | --- |',
      );
      for (const index of table.indexes)
        lines.push(
          `| \`${index.name}\` | ${
            index.unique ? 'Yes' : 'No'
          } | ${index.columns.map(c => `\`${c}\``).join(', ')} |`,
        );
      lines.push('');
      const definitions = table.indexes.filter(index => index.sql);
      if (definitions.length)
        lines.push(
          '```sql',
          ...definitions.map(index => `${index.sql};`),
          '```',
          '',
        );
    }
  }
  return `${lines.join('\n')}\n`;
}

async function main() {
  const schema = await inspectSchema();
  const refs = referencesFor(schema);
  validateDiagram(schema, refs);
  const snapshot = `${JSON.stringify(schema, null, 2)}\n`;
  const artifacts = {
    'lafina-schema.json': snapshot,
    'lafina-erd.dot': createDot(schema, refs),
    'lafina-erd.md': createGuide(schema, refs),
  };
  const digest = createHash('sha256')
    .update(JSON.stringify(artifacts))
    .digest('hex');
  if (process.argv.includes('--check')) {
    for (const [name, content] of Object.entries(artifacts)) {
      if (fs.readFileSync(path.join(output, name), 'utf8') !== content)
        throw new Error(`ERD artifact ${name} is stale. Run the generator.`);
    }
    if (
      !fs
        .readFileSync(path.join(output, 'lafina-erd.svg'), 'utf8')
        .includes(
          `<metadata id="lafina-erd-source-sha256">${digest}</metadata>`,
        ) ||
      !fs
        .readFileSync(path.join(output, 'lafina-erd.png'))
        .includes(Buffer.from(digest))
    ) {
      throw new Error(
        'Rendered ERD is stale. Run the generator with --render.',
      );
    }
    console.log(
      `ERD verified: schema ${schema.schemaVersion}, ${
        schema.tables.length
      } tables, ${schema.tables.reduce(
        (n, t) => n + t.columns.length,
        0,
      )} columns, ${schema.tables.reduce(
        (n, t) => n + t.foreignKeys.length,
        0,
      )} declared foreign keys.`,
    );
    return;
  }
  fs.mkdirSync(output, {recursive: true});
  for (const [name, content] of Object.entries(artifacts))
    fs.writeFileSync(path.join(output, name), content);
  if (process.argv.includes('--render')) {
    const {instance} = require('@viz-js/viz');
    const sharp = require('sharp');
    const viz = await instance();
    const result = viz.render(artifacts['lafina-erd.dot'], {format: 'svg'});
    if (result.status !== 'success')
      throw new Error(JSON.stringify(result.errors));
    const svg = result.output.replace(
      /<svg\b([^>]*)>/,
      `<svg$1 role="img" aria-labelledby="erd-title erd-description"><title id="erd-title">LAFINA local database entity–relationship diagram</title><desc id="erd-description">Schema ${schema.schemaVersion}; ${schema.tables.length} application tables. All declared columns, primary and unique keys, SQL foreign keys, and logical references. See lafina-erd.md for full definitions and semantics.</desc><metadata id="lafina-erd-source-sha256">${digest}</metadata>`,
    );
    fs.writeFileSync(path.join(output, 'lafina-erd.svg'), svg);
    await sharp(Buffer.from(svg), {density: 144})
      .resize({width: 4096, withoutEnlargement: true})
      .withMetadata({
        exif: {IFD0: {ImageDescription: `LAFINA ERD source SHA256 ${digest}`}},
      })
      .png()
      .toFile(path.join(output, 'lafina-erd.png'));
    console.log('Rendered SVG and PNG.');
  }
  console.log(
    `Extracted schema ${schema.schemaVersion}: ${schema.tables
      .map(t => t.name)
      .join(', ')}`,
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
