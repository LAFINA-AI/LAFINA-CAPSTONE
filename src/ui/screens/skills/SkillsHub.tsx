import {alarmsStore} from '../../../storage/alarmsStore';
import {useTodoData} from '../notes/hooks/useTodoData';
import React, {useEffect, useState} from 'react';
import {
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  AlarmClock,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BookOpen,
  Calculator,
  CheckCheck,
  CircleHelp,
  Copy,
  FileText,
  Mic,
  Pin,
  Search,
  Sparkles,
  Timer,
  AlignLeft,
} from 'lucide-react-native';
import {db, notesQueryStore} from '../../../storage';
import {escapeLike} from '../../../storage/notesQueryStore';
import {readSkillState, writeSkillState} from '../../../skills/skillsState';
import {SkillFonts, useSkillsPalette} from '../../theme/skills';
import {Entry, SkillButton, SkillCard, SkillText, ui} from './SkillUI';

export type SkillRoute =
  | 'hub'
  | 'alarms'
  | 'todo'
  | 'notes'
  | 'pomodoro'
  | 'flashcards'
  | 'quiz'
  | 'gwa'
  | 'summarizer'
  | 'meetings'
  | 'docgen'
  | 'all';
export const SKILLS = [
  {id: 'pomodoro', title: 'Pomodoro', description: '25-min focus', icon: Timer},
  {
    id: 'flashcards',
    title: 'Flashcards',
    description: 'Make & review',
    icon: Copy,
  },
  {
    id: 'quiz',
    title: 'Quiz maker',
    description: 'From your notes',
    icon: CircleHelp,
  },
  {
    id: 'gwa',
    title: 'GWA calculator',
    description: 'USTP 1–5 scale',
    icon: Calculator,
  },
  {
    id: 'summarizer',
    title: 'Summarizer',
    description: 'Shorten readings',
    icon: AlignLeft,
  },
  {
    id: 'meetings',
    title: 'Meetings',
    description: 'Record & transcribe',
    icon: Mic,
  },
  {
    id: 'docgen',
    title: 'Create with LAFINA',
    description: 'Slides, docs & PDF',
    icon: Sparkles,
  },
] as const;
const noRefresh = () => {};
const ESSENTIALS = [
  {id: 'alarms', title: 'Alarms', icon: AlarmClock},
  {id: 'todo', title: 'To-do', icon: CheckCheck},
  {id: 'notes', title: 'Notes', icon: FileText},
] as const;
export function SkillsHub({
  userId,
  refreshTrigger,
  onOpen,
  onEntity,
}: {
  userId: string;
  refreshTrigger: number;
  onOpen: (route: SkillRoute) => void;
  onEntity: (kind: 'task' | 'note', id: string) => void;
}) {
  const p = useSkillsPalette();
  const todo = useTodoData({
    userId,
    refreshTrigger,
    enabled: false,
    searchQuery: '',
    onRefresh: noRefresh,
  });
  const [query, setQuery] = useState('');
  const [edit, setEdit] = useState(false);
  const [order, setOrder] = useState<string[]>(() =>
    readSkillState(
      userId,
      'order',
      SKILLS.map(s => s.id),
    ),
  );
  const [pinned, setPinned] = useState<string[]>(() =>
    readSkillState(userId, 'pins', []),
  );
  const [counts, setCounts] = useState({alarms: 0, todo: 0, notes: 0});
  const [results, setResults] = useState<
    Array<{id: string; kind: 'note' | 'task'; title: string}>
  >([]);
  const [indexing, setIndexing] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const load = () => {
      try {
        const count = (table: string, extra = '') =>
          Number(
            db.executeSync(
              `SELECT COUNT(*) AS count FROM ${table} WHERE user_id = ? AND deleted_at IS NULL ${extra}`,
              [userId],
            ).rows[0]?.count ?? 0,
          );
        setCounts({
          alarms: alarmsStore.list(userId).filter(a => a.enabled).length,
          todo: count('tasks', 'AND is_completed = 0'),
          notes: count('notes'),
        });
        if (!query.trim()) {
          setResults([]);
          setIndexing(false);
          setError('');
          return;
        }
        const page = notesQueryStore.page({
          userId,
          search: query,
          filter: 'All',
          limit: 20,
        });
        const tasks = db.executeSync(
          "SELECT id,title FROM tasks WHERE user_id = ? AND deleted_at IS NULL AND title LIKE ? ESCAPE '\\' ORDER BY is_completed,updated_at DESC LIMIT 20",
          [userId, `%${escapeLike(query.trim())}%`],
        ).rows;
        if (!active) return;
        setResults([
          ...page.items.map(n => ({
            id: n.id,
            kind: 'note' as const,
            title: n.title,
          })),
          ...tasks.map(t => ({
            id: String(t.id),
            kind: 'task' as const,
            title: String(t.title),
          })),
        ]);
        setIndexing(page.indexing);
        setError('');
        if (page.indexing) retry = setTimeout(load, 80);
      } catch {
        setError(
          'Could not read your skills data. Try opening the page again.',
        );
      }
    };
    load();
    return () => {
      active = false;
      if (retry) clearTimeout(retry);
    };
  }, [query, userId, refreshTrigger]);
  const ordered = [...SKILLS].sort(
    (a, b) =>
      Number(pinned.includes(b.id)) - Number(pinned.includes(a.id)) ||
      order.indexOf(a.id) - order.indexOf(b.id),
  );
  const shown = query.trim()
    ? ordered.filter(s =>
        `${s.title} ${s.description}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      )
    : ordered
        .filter(s => s.id !== 'docgen' || pinned.includes(s.id))
        .slice(0, 6);
  const save = (nextOrder: string[], nextPins: string[]) => {
    try {
      db.transactionSync(() => {
        writeSkillState(userId, 'order', nextOrder);
        writeSkillState(userId, 'pins', nextPins);
      });
      setOrder(nextOrder);
      setPinned(nextPins);
    } catch (e) {
      Alert.alert('Skills not saved', (e as Error).message);
    }
  };
  const move = (id: string, delta: number) => {
    const next = [...order];
    const i = next.indexOf(id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    save(next, pinned);
  };
  return (
    <>
      <ScrollView
        testID="skills-hub"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        <Entry duration={550}>
          <View style={ui.between}>
            <Text
              accessibilityRole="header"
              style={[styles.title, {color: p.text}]}
            >
              Skills
            </Text>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Edit pinned skills and order"
              onPress={() => setEdit(true)}
              style={[styles.edit, {backgroundColor: p.surface}]}
            >
              <Pin size={16} color={p.text} />
              <SkillText strong>Edit</SkillText>
            </TouchableOpacity>
          </View>
        </Entry>
        <Entry duration={550} delay={30}>
          <View style={[styles.search, {backgroundColor: p.surface}]}>
            <Search size={18} color={p.muted} />
            <TextInput
              accessibilityLabel="Search skills, notes, to-dos"
              placeholder="Search skills, notes, to-dos…"
              placeholderTextColor={p.muted}
              value={query}
              maxLength={100}
              onChangeText={setQuery}
              style={[styles.searchInput, {color: p.text}]}
            />
          </View>
        </Entry>
        <View style={styles.essentials}>
          {ESSENTIALS.filter(
            s => !query || s.title.toLowerCase().includes(query.toLowerCase()),
          ).map((s, i) => (
            <Entry key={s.id} delay={60 + i * 30} style={ui.fill}>
              <TouchableOpacity
                testID={`skills-open-${s.id}`}
                accessibilityRole="button"
                accessibilityLabel={`Open ${s.title}`}
                onPress={() => onOpen(s.id)}
                style={[
                  styles.essential,
                  {backgroundColor: p.card, borderColor: p.border},
                ]}
              >
                <View
                  style={[
                    styles.iconTile,
                    {
                      backgroundColor:
                        i === 0 ? p.peach : i === 1 ? p.mint : p.surface,
                    },
                  ]}
                >
                  <s.icon size={18} color={p.accent} />
                </View>
                <SkillText strong size={15}>
                  {s.title}
                </SkillText>
                <SkillText muted size={12}>
                  {s.id === 'alarms'
                    ? counts.alarms
                      ? `${counts.alarms} on`
                      : 'None on'
                    : s.id === 'todo'
                    ? `${todo.pendingCount} open`
                    : `${counts.notes} notes`}
                </SkillText>
              </TouchableOpacity>
            </Entry>
          ))}
        </View>
        {!query && (
          <Entry duration={550} delay={150}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Create with LAFINA: slides, document or PDF"
              onPress={() => onOpen('docgen')}
              style={[styles.create, {backgroundColor: p.darkInkBtn}]}
            >
              <Sparkles size={100} color={p.accent} style={styles.sparkle} />
              <Text style={styles.eyebrow}>✦ CREATE WITH LAFINA</Text>
              <Text style={styles.createTitle}>
                Turn your notes into slides,{'\n'}docs or a PDF
              </Text>
              <View style={ui.between}>
                <View style={ui.row}>
                  {['Slides', 'Doc', 'PDF'].map(t => (
                    <Text key={t} style={styles.badge}>
                      {t}
                    </Text>
                  ))}
                </View>
                <View style={[styles.arrow, {backgroundColor: p.accent}]}>
                  <ArrowRight size={20} color={p.onAccent} />
                </View>
              </View>
            </TouchableOpacity>
          </Entry>
        )}
        <Entry duration={550} delay={200}>
          <View style={[ui.between, ui.section]}>
            <SkillText strong size={17}>
              {query ? 'Skills' : 'Study skills'}
            </SkillText>
            <TouchableOpacity
              style={ui.icon}
              accessibilityRole="button"
              accessibilityLabel="All skills"
              onPress={() => onOpen('all')}
            >
              <Text
                style={{
                  fontFamily: SkillFonts.medium,
                  color: p.accent,
                  fontSize: 14,
                }}
              >
                All {SKILLS.length}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.grid}>
            {shown.map(s => (
              <TouchableOpacity
                key={s.id}
                accessibilityRole="button"
                accessibilityLabel={`Open ${s.title}`}
                onPress={() => onOpen(s.id)}
                style={[
                  styles.study,
                  {backgroundColor: p.card, borderColor: p.border},
                ]}
              >
                <View style={[styles.studyIcon, {backgroundColor: p.surface}]}>
                  <s.icon size={20} color={p.accent} />
                </View>
                <View style={ui.fill}>
                  <SkillText strong>{s.title}</SkillText>
                  <SkillText muted size={12}>
                    {s.description}
                  </SkillText>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </Entry>
        {query && (
          <>
            <View style={ui.section}>
              <SkillText strong size={17}>
                Notes & to-dos
              </SkillText>
            </View>
            {indexing && (
              <SkillText muted>Preparing your notes for search…</SkillText>
            )}
            {!indexing && !results.length && (
              <SkillText muted>No notes or to-dos match this search.</SkillText>
            )}
            {results.map(r => (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={`Open ${r.kind}: ${r.title}`}
                key={`${r.kind}:${r.id}`}
                onPress={() => onEntity(r.kind, r.id)}
              >
                <SkillCard>
                  <View style={ui.row}>
                    <BookOpen size={18} color={p.accent} />
                    <SkillText>{r.title}</SkillText>
                  </View>
                  <SkillText muted size={12}>
                    {r.kind === 'note' ? 'Note' : 'To-do'}
                  </SkillText>
                </SkillCard>
              </TouchableOpacity>
            ))}
            <SkillText muted size={12}>
              Showing up to 20 of each. Open Notes or To-do for the full
              searchable list.
            </SkillText>
          </>
        )}
        {!!error && (
          <Text accessibilityRole="alert" style={{color: p.danger}}>
            {error}
          </Text>
        )}
      </ScrollView>
      <Modal
        visible={edit}
        transparent
        animationType="none"
        onRequestClose={() => setEdit(false)}
      >
        <View style={[styles.sheet, {backgroundColor: p.bg}]}>
          <SkillText strong size={20}>
            Pin & reorder skills
          </SkillText>
          <ScrollView>
            {order.map((id, i) => {
              const s = SKILLS.find(x => x.id === id);
              return s ? (
                <SkillCard key={id}>
                  <SkillText strong>{s.title}</SkillText>
                  <View style={ui.between}>
                    <TouchableOpacity
                      accessibilityRole="checkbox"
                      accessibilityState={{checked: pinned.includes(id)}}
                      accessibilityLabel={`Pin ${s.title}`}
                      onPress={() =>
                        save(
                          order,
                          pinned.includes(id)
                            ? pinned.filter(x => x !== id)
                            : [...pinned, id],
                        )
                      }
                      style={ui.icon}
                    >
                      <Pin
                        color={pinned.includes(id) ? p.accent : p.muted}
                        size={20}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel={`Move ${s.title} up`}
                      disabled={i === 0}
                      onPress={() => move(id, -1)}
                      style={ui.icon}
                    >
                      <ArrowUp size={20} color={p.text} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel={`Move ${s.title} down`}
                      disabled={i === order.length - 1}
                      onPress={() => move(id, 1)}
                      style={ui.icon}
                    >
                      <ArrowDown size={20} color={p.text} />
                    </TouchableOpacity>
                  </View>
                </SkillCard>
              ) : null;
            })}
          </ScrollView>
          <SkillButton label="Done" onPress={() => setEdit(false)} />
        </View>
      </Modal>
    </>
  );
}
const styles = StyleSheet.create({
  content: {paddingHorizontal: 20, paddingTop: 20, paddingBottom: 150},
  title: {fontSize: 32, fontFamily: SkillFonts.bold, letterSpacing: -0.64},
  edit: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  search: {
    marginTop: 20,
    minHeight: 48,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontFamily: SkillFonts.body,
    fontSize: 15,
    minHeight: 48,
    paddingVertical: 8,
  },
  essentials: {flexDirection: 'row', gap: 10, marginTop: 16},
  essential: {minHeight: 100, borderRadius: 20, borderWidth: 1, padding: 14},
  iconTile: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  create: {
    marginTop: 14,
    borderRadius: 24,
    paddingTop: 16,
    paddingHorizontal: 18,
    paddingBottom: 18,
    overflow: 'hidden',
  },
  sparkle: {position: 'absolute', right: -15, top: -10, opacity: 0.35},
  eyebrow: {
    fontFamily: SkillFonts.semibold,
    fontSize: 12,
    letterSpacing: 0.96,
    color: '#FFFFFF',
  },
  createTitle: {
    fontFamily: SkillFonts.semibold,
    fontSize: 18,
    lineHeight: 24,
    color: '#FFFFFF',
    marginTop: 8,
    marginBottom: 14,
  },
  badge: {
    backgroundColor: '#FFFFFF22',
    color: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    fontFamily: SkillFonts.body,
    fontSize: 13,
  },
  arrow: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grid: {flexDirection: 'row', flexWrap: 'wrap', gap: 10},
  study: {
    width: '48%',
    flexGrow: 1,
    minHeight: 68,
    borderWidth: 1,
    borderRadius: 18,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  studyIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheet: {
    marginTop: 40,
    padding: 20,
    flex: 1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
});
