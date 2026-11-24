import React, {useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  AlertTriangle,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Landmark,
  Search,
} from 'lucide-react-native';
import {
  getPassagesById,
  listChapterPassages,
  listKnowledgeChapters,
  listKnowledgeSources,
  listOfficialPages,
  prepareKnowledgeLibrary,
  searchKnowledgePassages,
  toPassageView,
  type PassageView,
} from '../../../handbook';
import type {KnowledgeCollection} from '../../../storage';
import {useTheme} from '../../contexts/ThemeContext';
import {Fonts, FontSize, Spacing} from '../../theme';
import {ToolSheet} from '../tools/ToolSheet';
import {ChatReplyText} from './ChatReplyText';
import {SourceNoteText} from './SourceNoteText';

/** What the sheet opens on: the passages behind one answer, or the library. */
export type UstpSourcesTarget =
  | {kind: 'used'; passageIds: string[]}
  | {kind: 'library'};

type Page =
  | {kind: 'used'; passageIds: string[]}
  | {kind: 'home'}
  | {kind: 'chapters'; collection: KnowledgeCollection; title: string}
  | {kind: 'passages'; collection: KnowledgeCollection; chapter: string};

interface UstpSourcesSheetProps {
  /** Null keeps the sheet closed. */
  target: UstpSourcesTarget | null;
  onClose: () => void;
}

const firstPage = (target: UstpSourcesTarget): Page =>
  target.kind === 'used'
    ? {kind: 'used', passageIds: target.passageIds}
    : {kind: 'home'};

const pageTitle = (page: Page): string => {
  switch (page.kind) {
    case 'used':
      return 'Sources for this answer';
    case 'home':
      return 'USTP sources';
    case 'chapters':
      return page.title;
    case 'passages':
      return page.chapter;
  }
};

/**
 * Every passage Ask USTP answers from, readable as stored, with its page,
 * date and official links. Opened from "See passages" under an answer (the
 * exact passages that answer used) or from the sidebar (the whole library).
 */
export function UstpSourcesSheet({target, onClose}: UstpSourcesSheetProps) {
  const {colors, isModern, modernPalette} = useTheme();
  const accent = isModern ? modernPalette.accent : colors.primary;
  const [stack, setStack] = useState<Page[]>([]);
  const [ready, setReady] = useState<boolean | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!target) {
      setStack([]);
      return;
    }
    setStack([firstPage(target)]);
    setQuery('');
    let cancelled = false;
    setReady(null);
    void prepareKnowledgeLibrary().then(ok => {
      if (!cancelled) setReady(ok);
    });
    return () => {
      cancelled = true;
    };
  }, [target]);

  const page = stack[stack.length - 1] ?? null;
  const push = (next: Page) => setStack(prev => [...prev, next]);
  const back = () => {
    if (stack.length > 1) {
      setStack(prev => prev.slice(0, -1));
    } else {
      onClose();
    }
  };

  const palette = useMemo(
    () => ({
      text: colors.textPrimary,
      muted: colors.textSecondary,
      border: isModern ? modernPalette.border : colors.border,
      card: isModern ? modernPalette.card : colors.cardBg,
      soft: isModern ? modernPalette.softViolet : colors.inputBg,
      warnBg: isModern ? modernPalette.cream : colors.noteHighlightBg,
      warnInk: isModern ? modernPalette.creamInk : colors.textPrimary,
      accent,
    }),
    [accent, colors, isModern, modernPalette],
  );

  if (!target || !page) {
    return null;
  }

  let content: React.ReactNode;
  if (ready === null) {
    content = (
      <View style={styles.center} testID="ustp-sources-loading">
        <ActivityIndicator color={accent} />
      </View>
    );
  } else if (!ready) {
    content = (
      <Text style={[styles.body, {color: palette.muted}]}>
        The USTP sources are not available on this phone right now.
      </Text>
    );
  } else if (page.kind === 'used') {
    content = (
      <UsedPage
        passageIds={page.passageIds}
        palette={palette}
        onBrowse={() => push({kind: 'home'})}
      />
    );
  } else if (page.kind === 'home') {
    content = (
      <HomePage
        query={query}
        onQuery={setQuery}
        palette={palette}
        onOpenSource={(collection, title) =>
          push({kind: 'chapters', collection, title})
        }
      />
    );
  } else if (page.kind === 'chapters') {
    content = (
      <ChaptersPage
        collection={page.collection}
        palette={palette}
        onOpen={chapter =>
          push({kind: 'passages', collection: page.collection, chapter})
        }
      />
    );
  } else {
    content = (
      <PassageList
        passages={listChapterPassages(page.collection, page.chapter)}
        palette={palette}
      />
    );
  }

  return (
    <ToolSheet
      visible
      title={pageTitle(page)}
      onClose={onClose}
      onRequestClose={back}
    >
      <View testID="ustp-sources-sheet">
        {stack.length > 1 ? (
          <TouchableOpacity
            style={styles.backRow}
            onPress={back}
            accessibilityRole="button"
            accessibilityLabel="Back"
            testID="ustp-sources-back"
            hitSlop={8}
          >
            <ChevronLeft size={16} color={accent} />
            <Text style={[styles.backText, {color: accent}]}>Back</Text>
          </TouchableOpacity>
        ) : null}
        {content}
      </View>
    </ToolSheet>
  );
}

interface Palette {
  text: string;
  muted: string;
  border: string;
  card: string;
  soft: string;
  warnBg: string;
  warnInk: string;
  accent: string;
}

function UsedPage({
  passageIds,
  palette,
  onBrowse,
}: {
  passageIds: string[];
  palette: Palette;
  onBrowse: () => void;
}) {
  const passages = useMemo(() => getPassagesById(passageIds), [passageIds]);
  return (
    <View>
      <Text style={[styles.body, {color: palette.muted}]}>
        {passages.length > 0
          ? 'This answer was written from the passages below, shown exactly as LAFINA stores them. Online answers are worded by the AI, so compare the answer with the text.'
          : 'These passages are no longer in this version of the USTP sources. You can still browse everything LAFINA uses now.'}
      </Text>
      {passages.length > 0 && passages.length < passageIds.length ? (
        <Text style={[styles.small, {color: palette.muted}]}>
          Some passages from this answer are not in this version of the sources.
        </Text>
      ) : null}
      <PassageList passages={passages} palette={palette} />
      <TouchableOpacity
        style={[styles.browseButton, {borderColor: palette.accent}]}
        onPress={onBrowse}
        accessibilityRole="button"
        testID="ustp-sources-browse"
      >
        <BookOpen size={15} color={palette.accent} />
        <Text style={[styles.browseText, {color: palette.accent}]}>
          Browse all USTP sources
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function HomePage({
  query,
  onQuery,
  palette,
  onOpenSource,
}: {
  query: string;
  onQuery: (text: string) => void;
  palette: Palette;
  onOpenSource: (collection: KnowledgeCollection, title: string) => void;
}) {
  const sources = useMemo(() => listKnowledgeSources(), []);
  const officialPages = useMemo(() => listOfficialPages(), []);
  const trimmed = query.trim();
  const results = useMemo(
    () => (trimmed.length >= 2 ? searchKnowledgePassages(trimmed) : null),
    [trimmed],
  );
  return (
    <View>
      <Text
        style={[styles.body, {color: palette.muted}]}
        testID="ustp-sources-intro"
      >
        Ask USTP answers only from the passages here, all stored on this phone.
        Each one shows where it came from and when it was checked. Calls with
        LAFINA use a separate online copy of the Student Handbook.
      </Text>
      <View
        style={[
          styles.searchBox,
          {borderColor: palette.border, backgroundColor: palette.soft},
        ]}
      >
        <Search size={15} color={palette.muted} />
        <TextInput
          value={query}
          onChangeText={onQuery}
          placeholder="Search every passage"
          placeholderTextColor={palette.muted}
          style={[styles.searchInput, {color: palette.text}]}
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Search every passage"
          testID="ustp-sources-search"
        />
      </View>
      {results ? (
        <View>
          <Text
            style={[styles.small, {color: palette.muted}]}
            testID="ustp-sources-result-count"
          >
            {results.length === 0
              ? `No passage contains "${trimmed}".`
              : `${
                  results.length === 30 ? 'First 30' : results.length
                } passage${
                  results.length === 1 ? '' : 's'
                } containing "${trimmed}"`}
          </Text>
          <PassageList passages={results} palette={palette} />
        </View>
      ) : (
        <View>
          {sources.map(source => (
            <TouchableOpacity
              key={source.collection}
              style={[
                styles.sourceCard,
                {borderColor: palette.border, backgroundColor: palette.card},
              ]}
              onPress={() => onOpenSource(source.collection, source.title)}
              accessibilityRole="button"
              accessibilityLabel={`Open ${source.title}`}
              testID={`ustp-sources-open-${source.collection}`}
            >
              <View style={styles.sourceIcon}>
                {source.collection === 'handbook' ? (
                  <BookOpen size={18} color={palette.accent} />
                ) : (
                  <Landmark size={18} color={palette.accent} />
                )}
              </View>
              <View style={styles.flex}>
                <Text style={[styles.cardTitle, {color: palette.text}]}>
                  {source.title}
                </Text>
                <Text style={[styles.small, {color: palette.muted}]}>
                  {source.description}
                </Text>
                <Text style={[styles.small, {color: palette.accent}]}>
                  {`${source.passageCount} passages · ${source.chapterCount} ${source.chapterNoun}`}
                </Text>
              </View>
              <ChevronRight size={16} color={palette.muted} />
            </TouchableOpacity>
          ))}
          {officialPages.length > 0 ? (
            <View style={styles.section} testID="ustp-sources-official-pages">
              <Text style={[styles.sectionTitle, {color: palette.text}]}>
                {`All ${officialPages.length} official pages behind the USTP CDO answers`}
              </Text>
              <SourceRedirectWarningCard palette={palette} />
              {officialPages.map(source => (
                <SourceNoteText
                  key={source.url}
                  note={`[${source.title.replace(/[[\]()]/g, '')}](${
                    source.url
                  })`}
                  style={[styles.linkLine, {color: palette.muted}]}
                  linkColor={palette.accent}
                />
              ))}
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}

function ChaptersPage({
  collection,
  palette,
  onOpen,
}: {
  collection: KnowledgeCollection;
  palette: Palette;
  onOpen: (chapter: string) => void;
}) {
  const chapters = useMemo(
    () => listKnowledgeChapters(collection),
    [collection],
  );
  return (
    <View testID="ustp-sources-chapters">
      {chapters.map(chapter => (
        <TouchableOpacity
          key={chapter.chapter}
          style={[styles.chapterRow, {borderColor: palette.border}]}
          onPress={() => onOpen(chapter.chapter)}
          accessibilityRole="button"
          testID="ustp-sources-chapter"
        >
          <View style={styles.flex}>
            <Text style={[styles.chapterTitle, {color: palette.text}]}>
              {chapter.chapter}
            </Text>
            <Text style={[styles.small, {color: palette.muted}]}>
              {`${chapter.passageCount} passage${
                chapter.passageCount === 1 ? '' : 's'
              }`}
            </Text>
          </View>
          <ChevronRight size={16} color={palette.muted} />
        </TouchableOpacity>
      ))}
    </View>
  );
}

export interface SourceRedirectWarningCardProps {
  palette: Pick<Palette, 'warnBg' | 'warnInk' | 'border' | 'card'>;
  title?: string;
  message?: string;
  testID?: string;
}

export function SourceRedirectWarningCard({
  palette,
  title = 'External source links',
  message = 'Tapping a source link will redirect you outside LAFINA to the official webpage in your browser.',
  testID = 'ustp-sources-redirect-warning',
}: SourceRedirectWarningCardProps) {
  return (
    <View
      style={[
        styles.redirectWarningCard,
        {
          backgroundColor: palette.warnBg,
          borderColor: palette.border,
          borderLeftColor: palette.warnInk,
        },
      ]}
      accessibilityRole="text"
      testID={testID}
    >
      <View
        style={[
          styles.redirectWarningIconWrap,
          {backgroundColor: palette.card, borderColor: palette.border},
        ]}
      >
        <AlertTriangle size={16} color={palette.warnInk} />
      </View>
      <View style={styles.redirectWarningContent}>
        <View style={styles.redirectWarningHeader}>
          <Text
            style={[styles.redirectWarningTitle, {color: palette.warnInk}]}
          >
            {title}
          </Text>
          <ExternalLink size={13} color={palette.warnInk} />
        </View>
        <Text style={[styles.redirectWarningBody, {color: palette.warnInk}]}>
          {message}
        </Text>
      </View>
    </View>
  );
}

const EXTERNAL_LINK_RE = /https?:\/\//i;

function PassageList({
  passages,
  palette,
}: {
  passages: ReturnType<typeof getPassagesById>;
  palette: Palette;
}) {
  const views = useMemo(
    () => passages.map(hit => toPassageView(hit)),
    [passages],
  );
  const hasExternalLinks = useMemo(
    () =>
      views.some(
        view =>
          EXTERNAL_LINK_RE.test(view.citation ?? '') ||
          (view.collection === 'ustp_cdo' && EXTERNAL_LINK_RE.test(view.body)),
      ),
    [views],
  );
  return (
    <View>
      {hasExternalLinks ? (
        <SourceRedirectWarningCard palette={palette} />
      ) : null}
      {views.map(view => (
        <PassageCard key={view.id} view={view} palette={palette} />
      ))}
    </View>
  );
}

function PassageCard({view, palette}: {view: PassageView; palette: Palette}) {
  return (
    <View
      style={[
        styles.passage,
        {borderColor: palette.border, backgroundColor: palette.card},
      ]}
      testID="ustp-source-passage"
    >
      <Text style={[styles.cardTitle, {color: palette.text}]} selectable>
        {view.heading}
      </Text>
      <Text style={[styles.small, {color: palette.muted}]} selectable>
        {view.location}
      </Text>
      {view.scope ? (
        <Text style={[styles.small, {color: palette.accent}]}>
          {view.scope}
        </Text>
      ) : null}
      <View style={styles.passageBody}>
        {view.collection === 'ustp_cdo' ? (
          <ChatReplyText
            content={view.body}
            format="markdown"
            textStyle={[styles.body, {color: palette.text}]}
          />
        ) : (
          <Text style={[styles.body, {color: palette.text}]} selectable>
            {view.body}
          </Text>
        )}
      </View>
      {view.caveats.map(caveat => (
        <View
          key={caveat}
          style={[styles.caveat, {backgroundColor: palette.warnBg}]}
          testID="ustp-source-caveat"
        >
          <AlertTriangle size={13} color={palette.warnInk} />
          <Text style={[styles.small, styles.flex, {color: palette.warnInk}]}>
            {caveat}
          </Text>
        </View>
      ))}
      {view.staleNote ? (
        <Text style={[styles.small, {color: palette.warnInk}]}>
          {view.staleNote}
        </Text>
      ) : null}
      {view.citation ? (
        <SourceNoteText
          note={view.citation}
          style={[styles.small, styles.citation, {color: palette.muted}]}
          linkColor={palette.accent}
          testID="ustp-source-citation"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {flex: 1},
  center: {paddingVertical: Spacing.xxl, alignItems: 'center'},
  body: {
    fontFamily: Fonts.body,
    fontSize: FontSize.body,
    lineHeight: 20,
  },
  small: {
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
    lineHeight: 17,
    marginTop: 2,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 2,
    marginBottom: Spacing.sm,
  },
  backText: {
    fontFamily: Fonts.body,
    fontSize: FontSize.body,
    fontWeight: '600',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: FontSize.body,
    paddingVertical: Spacing.sm,
  },
  sourceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderWidth: 1,
    borderRadius: 14,
    padding: Spacing.md,
    marginTop: Spacing.sm,
  },
  sourceIcon: {width: 24, alignItems: 'center'},
  cardTitle: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.bodyLarge,
    fontWeight: '600',
  },
  section: {marginTop: Spacing.lg, gap: Spacing.xs},
  sectionTitle: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.body,
    fontWeight: '600',
    marginBottom: Spacing.xs,
  },
  linkLine: {fontFamily: Fonts.body, fontSize: FontSize.small, lineHeight: 20},
  chapterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.md,
  },
  chapterTitle: {
    fontFamily: Fonts.body,
    fontSize: FontSize.body,
    fontWeight: '600',
  },
  passage: {
    borderWidth: 1,
    borderRadius: 14,
    padding: Spacing.md,
    marginTop: Spacing.md,
  },
  passageBody: {marginTop: Spacing.sm},
  caveat: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    borderRadius: 10,
    padding: Spacing.sm,
    marginTop: Spacing.sm,
  },
  redirectWarningCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    borderWidth: 1,
    borderLeftWidth: 3,
    borderRadius: 12,
    padding: Spacing.md,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  redirectWarningIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  redirectWarningContent: {
    flex: 1,
    minWidth: 0,
  },
  redirectWarningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  redirectWarningTitle: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.body,
    fontWeight: '600',
    flexShrink: 1,
  },
  redirectWarningBody: {
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
    lineHeight: 18,
    marginTop: 3,
    opacity: 0.92,
  },
  citation: {marginTop: Spacing.sm},
  browseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: Spacing.md,
    marginTop: Spacing.lg,
  },
  browseText: {
    fontFamily: Fonts.body,
    fontSize: FontSize.body,
    fontWeight: '600',
  },
});
