import {alarmsStore} from '../../../storage/alarmsStore';
import React, {useEffect, useRef, useState} from 'react';
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
import {db, materialStore, notesQueryStore} from '../../../storage';
import type {UserMaterialRecord} from '../../../storage';
import {escapeLike} from '../../../storage/notesQueryStore';
import {readSkillState, writeSkillState} from '../../../skills/skillsState';
import {useStudyJob} from '../../../skills/studyJobs';
import {readDecks, subscribeDecks} from '../../../skills/studyDecks';
import {getDeckStats} from '../../../skills/studyLogic';
import type {Deck} from '../../../skills/studyLogic';
import {ScreenOverlays, useScreenActive} from '../../navigation/RetainedTab';
import {SkillFonts, useSkillsPalette} from '../../theme/skills';
import {Entry, SkillButton, SkillCard, SkillText, ui} from './SkillUI';

export type SkillRoute =
  | 'hub'
  | 'alarms'
  | 'todo'
  | 'notes'
  | 'materials'
  | 'pomodoro'
  | 'flashcards'
  | 'quiz'
  | 'gwa'
  | 'summarizer'
  | 'meetings'
  | 'docgen'
  | 'all';
export const SKILLS = [
  {
    id: 'materials',
    title: 'Lesson Q&A',
    description: 'Upload PDFs & ask',
    icon: BookOpen,
  },
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
    description: 'Slides, docs, PDF & sheets',
    icon: Sparkles,
  },
] as const;
const SKILL_SEARCH_ALIASES: Record<string, string> = {
  docgen:
    'pptx docx xlsx word excel powerpoint spreadsheet presentation report document handout deck',
};
const MAX_SEARCH_INDEX_RETRIES = 25;
const ESSENTIALS = [
  {id: 'alarms', title: 'Alarms', icon: AlarmClock},
  {id: 'todo', title: 'To-do', icon: CheckCheck},
  {id: 'notes', title: 'Notes', icon: FileText},
] as const;
const normalizeSkillOrder = (raw: readonly string[]): string[] => {
  const validIds: readonly string[] = SKILLS.map(s => s.id);
  const kept = raw.filter(id => validIds.includes(id));
  const missing = validIds.filter(id => !kept.includes(id));
  return Array.from(new Set([...kept, ...missing]));
};

export const SkillsHub = React.memo(function SkillsHubView({
  userId,
  refreshTrigger,
  isVisible = true,
  onOpen,
  onOpenMaterial,
  onEntity,
  onOpenDeck,
}: {
  userId: string;
  refreshTrigger: number;
  isVisible?: boolean;
  onOpen: (route: SkillRoute) => void;
  onOpenMaterial?: (materialId: string) => void;
  onEntity: (kind: 'task' | 'note', id: string) => void;
  onOpenDeck?: (deckId: string) => void;
}) {
  const p = useSkillsPalette();
  const docJob = useStudyJob(userId, 'document');
  const screenActive = useScreenActive();
  const [decks, setDecks] = useState<Deck[]>(() => readDecks(userId));
  useEffect(() => {
    setDecks(readDecks(userId));
    return subscribeDecks(userId, () => setDecks(readDecks(userId)));
  }, [userId, refreshTrigger, screenActive]);
  const [query, setQuery] = useState('');
  const trimmedQuery = query.trim();
  const [debouncedQuery, setDebouncedQuery] = useState(trimmedQuery);
  useEffect(() => {
    if (!trimmedQuery) {
      setDebouncedQuery('');
      return;
    }
    const timer = setTimeout(() => setDebouncedQuery(trimmedQuery), 150);
    return () => clearTimeout(timer);
  }, [trimmedQuery]);
  const normalizedQuery = trimmedQuery.toLowerCase();
  const [edit, setEdit] = useState(false);
  const [order, setOrder] = useState<string[]>(() =>
    normalizeSkillOrder(
      readSkillState(
        userId,
        'order',
        SKILLS.map(s => s.id),
      ),
    ),
  );
  const normalizedOrder = normalizeSkillOrder(order);
  const [pinned, setPinned] = useState<string[]>(() =>
    readSkillState(userId, 'pins', []),
  );
  const [counts, setCounts] = useState({alarms: 0, notes: 0, openTasks: 0});
  const loadedCountsKeyRef = useRef('');
  const [results, setResults] = useState<
    Array<{id: string; kind: 'note' | 'task'; title: string}>
  >([]);
  const [materialMatches, setMaterialMatches] = useState<UserMaterialRecord[]>(
    [],
  );
  const [indexing, setIndexing] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!isVisible) return;
    const countKey = `${userId}:${refreshTrigger}`;
    if (loadedCountsKeyRef.current === countKey) return;
    try {
      const notesCount = Number(
        db.executeSync(
          'SELECT COUNT(*) AS count FROM notes WHERE user_id = ? AND deleted_at IS NULL',
          [userId],
        ).rows[0]?.count ?? 0,
      );
      const openTasksCount = Number(
        db.executeSync(
          'SELECT COUNT(*) AS count FROM tasks WHERE user_id = ? AND deleted_at IS NULL AND is_completed = 0',
          [userId],
        ).rows[0]?.count ?? 0,
      );
      loadedCountsKeyRef.current = countKey;
      setCounts({
        alarms: alarmsStore.list(userId).filter(a => a.enabled).length,
        notes: notesCount,
        openTasks: openTasksCount,
      });
      setError('');
    } catch {
      setError(
        'Could not read your skills data. Try opening the page again.',
      );
    }
  }, [isVisible, refreshTrigger, userId]);
  useEffect(() => {
    if (!isVisible) return;
    let active = true;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let retryCount = 0;
    const loadSearch = () => {
      try {
        if (!debouncedQuery) {
          setResults([]);
          setMaterialMatches([]);
          setIndexing(false);
          setError('');
          return;
        }
        const page = notesQueryStore.page({
          userId,
          search: debouncedQuery,
          filter: 'All',
          limit: 20,
        });
        const tasks = db.executeSync(
          "SELECT id,title FROM tasks WHERE user_id = ? AND deleted_at IS NULL AND title LIKE ? ESCAPE '\\' ORDER BY is_completed,updated_at DESC LIMIT 20",
          [userId, `%${escapeLike(debouncedQuery)}%`],
        ).rows;
        const foundMaterials = materialStore.searchMaterialTitles(
          userId,
          debouncedQuery,
          10,
        );
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
        setMaterialMatches(foundMaterials);
        setError('');
        if (page.indexing && retryCount < MAX_SEARCH_INDEX_RETRIES) {
          retryCount += 1;
          setIndexing(true);
          retry = setTimeout(loadSearch, 80);
        } else {
          setIndexing(false);
        }
      } catch {
        if (!active) return;
        setError(
          'Could not read your skills data. Try opening the page again.',
        );
      }
    };
    loadSearch();
    return () => {
      active = false;
      if (retry) clearTimeout(retry);
    };
  }, [debouncedQuery, isVisible, userId, refreshTrigger]);
  const ordered = [...SKILLS].sort(
    (a, b) =>
      Number(pinned.includes(b.id)) - Number(pinned.includes(a.id)) ||
      normalizedOrder.indexOf(a.id) - normalizedOrder.indexOf(b.id),
  );
  const shown = trimmedQuery
    ? ordered.filter(s =>
        `${s.title} ${s.description} ${SKILL_SEARCH_ALIASES[s.id] ?? ''}`
          .toLowerCase()
          .includes(normalizedQuery),
      )
    : ordered.filter(s => s.id !== 'docgen' || pinned.includes(s.id));
  const now = Date.now();
  const deckCount = decks.length;
  const dueCardsCount = decks.reduce(
    (sum, d) => sum + getDeckStats(d, now).due,
    0,
  );
  const deckMatches = trimmedQuery
    ? decks.filter(d => d.title.toLowerCase().includes(normalizedQuery))
    : [];
  const save = (nextOrder: string[], nextPins: string[]) => {
    const cleanOrder = normalizeSkillOrder(nextOrder);
    try {
      db.transactionSync(() => {
        writeSkillState(userId, 'order', cleanOrder);
        writeSkillState(userId, 'pins', nextPins);
      });
      setOrder(cleanOrder);
      setPinned(nextPins);
    } catch (e) {
      Alert.alert('Skills not saved', (e as Error).message);
    }
  };
  const move = (id: string, delta: number) => {
    const next = [...normalizedOrder];
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
            s =>
              !trimmedQuery || s.title.toLowerCase().includes(normalizedQuery),
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
                    ? `${counts.openTasks} open`
                    : `${counts.notes} notes`}
                </SkillText>
              </TouchableOpacity>
            </Entry>
          ))}
        </View>
        {!trimmedQuery && (
          <Entry duration={550} delay={150}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Create with LAFINA: slides, document or PDF"
              onPress={() => onOpen('docgen')}
              style={[styles.create, {backgroundColor: p.darkInkBtn}]}
            >
              <Sparkles size={100} color={p.accent} style={styles.sparkle} />
              <View style={ui.between}>
                <Text style={styles.eyebrow}>✦ CREATE WITH LAFINA</Text>
                {(docJob.busy || docJob.result !== null) && (
                  <Text style={styles.statusPill}>
                    {docJob.busy ? 'Creating your file…' : 'File ready →'}
                  </Text>
                )}
              </View>
              <Text style={styles.createTitle}>
                Turn your notes into slides,{'\n'}docs, sheets or a PDF
              </Text>
              <View style={ui.between}>
                <View style={ui.row}>
                  {['Slides', 'Doc', 'PDF', 'Sheet'].map(t => (
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
              {trimmedQuery ? 'Skills' : 'Study skills'}
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
                    {s.id === 'flashcards'
                      ? dueCardsCount > 0
                        ? `${dueCardsCount} due today`
                        : deckCount > 0
                        ? `${deckCount} ${deckCount === 1 ? 'deck' : 'decks'}`
                        : s.description
                      : s.description}
                  </SkillText>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </Entry>
        {!!trimmedQuery && (
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
                    <View style={ui.fill}>
                      <SkillText>{r.title}</SkillText>
                    </View>
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
            {materialMatches.length > 0 && (
              <>
                <View style={ui.section}>
                  <SkillText strong size={17}>
                    Lesson materials
                  </SkillText>
                </View>
                {materialMatches.map(mat => (
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={`Open Lesson Q&A for ${mat.title}`}
                    key={`mat:${mat.id}`}
                    onPress={() =>
                      onOpenMaterial
                        ? onOpenMaterial(mat.id)
                        : onOpen('materials')
                    }
                  >
                    <SkillCard>
                      <View style={ui.row}>
                        <BookOpen size={18} color={p.accent} />
                        <View style={ui.fill}>
                          <SkillText>{mat.title}</SkillText>
                        </View>
                      </View>
                      <SkillText muted size={12}>
                        {mat.fileKind.toUpperCase()} · {mat.pagesRead} page
                        {mat.pagesRead === 1 ? '' : 's'} · Open Lesson Q&A
                      </SkillText>
                    </SkillCard>
                  </TouchableOpacity>
                ))}
              </>
            )}
            {deckMatches.length > 0 && (
              <>
                <View style={ui.section}>
                  <SkillText strong size={17}>
                    Flashcard decks
                  </SkillText>
                </View>
                {deckMatches.map(d => {
                  const stats = getDeckStats(d, now);
                  return (
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel={`Open deck ${d.title}`}
                      key={`deck:${d.id}`}
                      onPress={() =>
                        onOpenDeck ? onOpenDeck(d.id) : onOpen('flashcards')
                      }
                    >
                      <SkillCard>
                        <View style={ui.row}>
                          <Copy size={18} color={p.accent} />
                          <View style={ui.fill}>
                            <SkillText>{d.title}</SkillText>
                          </View>
                        </View>
                        <SkillText muted size={12}>
                          {stats.total} {stats.total === 1 ? 'card' : 'cards'} ·{' '}
                          {stats.due > 0 ? `${stats.due} due` : 'All caught up'}
                        </SkillText>
                      </SkillCard>
                    </TouchableOpacity>
                  );
                })}
              </>
            )}
          </>
        )}
        {!!error && (
          <Text accessibilityRole="alert" style={{color: p.danger}}>
            {error}
          </Text>
        )}
      </ScrollView>
      <ScreenOverlays>
        {edit ? (
          <Modal
            visible
            transparent
            animationType="none"
            onRequestClose={() => setEdit(false)}
          >
            <View style={[styles.sheet, {backgroundColor: p.bg}]}>
              <SkillText strong size={20}>
                Pin & reorder skills
              </SkillText>
              <ScrollView>
                {normalizedOrder.map((id, i) => {
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
                              normalizedOrder,
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
                          disabled={i === normalizedOrder.length - 1}
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
        ) : null}
      </ScreenOverlays>
    </>
  );
});
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
  statusPill: {
    backgroundColor: '#FFFFFF28',
    color: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    fontFamily: SkillFonts.semibold,
    fontSize: 11,
    overflow: 'hidden',
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
