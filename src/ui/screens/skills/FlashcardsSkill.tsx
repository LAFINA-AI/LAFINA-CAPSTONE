import React, {useEffect, useRef, useState} from 'react';
import {
  Alert,
  Animated,
  Easing,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {readSkillState, writeSkillState} from '../../../skills/skillsState';
import {cardsFromSource} from '../../../skills/studyAi';
import {scheduleCard} from '../../../skills/studyLogic';
import type {Deck, Rating, StudyCard} from '../../../skills/studyLogic';
import {generateId} from '../../../utils';
import {SkillFonts, SkillMotion, useSkillsPalette} from '../../theme/skills';
import {useReducedMotion} from '../../hooks/useReducedMotion';
import {
  Choices,
  SkillButton,
  SkillCard,
  SkillInput,
  SkillText,
  ui,
} from './SkillUI';
import {SourcePicker} from './SourcePicker';
import type {SkillSource} from './SourcePicker';

export function FlashcardsSkill({
  userId,
  onQuiz,
}: {
  userId: string;
  onQuiz: () => void;
}) {
  const p = useSkillsPalette();
  const reduced = useReducedMotion();
  const [decks, setDecks] = useState<Deck[]>(() =>
    readSkillState(userId, 'decks', []),
  );
  const [deckId, setDeckId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [method, setMethod] = useState<'Manual' | 'From notes'>('Manual');
  const [source, setSource] = useState<SkillSource>({text: '', label: ''});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [queue, setQueue] = useState<StudyCard[]>([]);
  const [index, setIndex] = useState(0);
  const [studying, setStudying] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [ratings, setRatings] = useState<Rating[]>([]);
  const flip = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) {
      flip.setValue(flipped ? 1 : 0);
      return;
    }
    const a = Animated.timing(flip, {
      toValue: flipped ? 1 : 0,
      duration: SkillMotion.flip,
      easing: Easing.bezier(0.2, 0.8, 0.2, 1),
      useNativeDriver: true,
    });
    a.start();
    return () => a.stop();
  }, [flip, flipped, reduced]);
  const deck = decks.find(d => d.id === deckId);
  const persist = (next: Deck[]) => {
    writeSkillState(userId, 'decks', next);
    setDecks(next);
  };
  const start = (d: Deck, all = false) => {
    setDeckId(d.id);
    setQueue(all ? d.cards : d.cards.filter(c => c.dueAt <= Date.now()));
    setIndex(0);
    setRatings([]);
    setFlipped(false);
    setStudying(true);
    setCreating(false);
  };
  const add = async () => {
    if (busy) return;
    setError('');
    if (!title.trim() && !deck) {
      setError('Give your deck a name.');
      return;
    }
    if (method === 'Manual' && (!question.trim() || !answer.trim())) {
      setError('Write both a question and an answer.');
      return;
    }
    setBusy(true);
    try {
      const cards =
        method === 'From notes'
          ? await cardsFromSource(userId, source.text)
          : [
              {
                id: generateId('card'),
                question: question.trim(),
                answer: answer.trim(),
                intervalDays: 0,
                ease: 2.5,
                dueAt: Date.now(),
                reviews: 0,
              },
            ];
      const enriched = cards.map(c => ({
        ...c,
        ...(source.noteId && method === 'From notes'
          ? {sourceNoteId: source.noteId}
          : {}),
      }));
      if (deck)
        persist(
          decks.map(d =>
            d.id === deck.id ? {...d, cards: [...d.cards, ...enriched]} : d,
          ),
        );
      else {
        const created = {
          id: generateId('deck'),
          title: title.trim(),
          cards: enriched,
          createdAt: new Date().toISOString(),
        };
        persist([...decks, created]);
        setDeckId(created.id);
      }
      setQuestion('');
      setAnswer('');
      setCreating(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const rate = (rating: Rating) => {
    if (!deck || !queue[index] || !flipped) return;
    try {
      const updated = scheduleCard(queue[index], rating);
      persist(
        decks.map(d =>
          d.id === deck.id
            ? {
                ...d,
                cards: d.cards.map(c => (c.id === updated.id ? updated : c)),
              }
            : d,
        ),
      );
      setRatings([...ratings, rating]);
      setIndex(index + 1);
      setFlipped(false);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  if (studying && index >= queue.length)
    return (
      <View style={[ui.center, {paddingTop: 40, gap: 14}]}>
        <SkillText strong size={26}>
          {queue.length ? 'Session complete' : 'All caught up'}
        </SkillText>
        <SkillText muted>
          {queue.length
            ? `${queue.length} cards reviewed`
            : 'No cards are due right now.'}
        </SkillText>
        <View style={[ui.row, {flexWrap: 'wrap', justifyContent: 'center'}]}>
          {(['Again', 'Hard', 'Good', 'Easy'] as Rating[]).map(r => (
            <SkillCard key={r}>
              <SkillText strong size={22}>
                {ratings.filter(x => x === r).length}
              </SkillText>
              <SkillText muted size={12}>
                {r}
              </SkillText>
            </SkillCard>
          ))}
        </View>
        <SkillButton
          label="Study again"
          onPress={() => deck && start(deck, true)}
        />
        <SkillButton
          secondary
          label="Back to decks"
          onPress={() => {
            setStudying(false);
            setDeckId(null);
          }}
        />
        <SkillButton
          secondary
          label="Test yourself with a quiz"
          onPress={onQuiz}
        />
      </View>
    );
  if (studying && queue[index])
    return (
      <>
        <View style={ui.between}>
          <SkillText strong size={17}>
            {deck?.title}
          </SkillText>
          <SkillText muted>
            {index + 1} / {queue.length}
          </SkillText>
        </View>
        <View
          accessibilityRole="progressbar"
          accessibilityValue={{min: 0, max: queue.length, now: index}}
          style={{
            height: 6,
            borderRadius: 3,
            backgroundColor: p.surface,
            marginTop: 14,
          }}
        >
          <View
            style={{
              width: `${(index / queue.length) * 100}%`,
              height: 6,
              borderRadius: 3,
              backgroundColor: p.accent,
            }}
          />
        </View>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={`${flipped ? 'Answer' : 'Question'}: ${
            flipped ? queue[index].answer : queue[index].question
          }. ${flipped ? 'Tap for question' : 'Tap to reveal answer'}`}
          onPress={() => setFlipped(!flipped)}
          style={{height: 400, marginTop: 26, marginHorizontal: 4}}
        >
          <Animated.View
            style={{
              flex: 1,
              transform: [
                {perspective: 1200},
                {
                  rotateY: flip.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0deg', '180deg'],
                  }),
                },
              ],
            }}
          >
            {[false, true].map(back => (
              <View
                key={String(back)}
                accessibilityElementsHidden={back !== flipped}
                importantForAccessibility={
                  back === flipped ? 'auto' : 'no-hide-descendants'
                }
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: 0,
                  right: 0,
                  borderRadius: 28,
                  backgroundColor: back ? p.darkInkBtn : p.card,
                  borderWidth: 1,
                  borderColor: p.border,
                  padding: 24,
                  backfaceVisibility: 'hidden',
                  transform: [{rotateY: back ? '180deg' : '0deg'}],
                  justifyContent: 'space-between',
                }}
              >
                <Text
                  style={{
                    fontFamily: SkillFonts.semibold,
                    fontSize: 12,
                    letterSpacing: 1.2,
                    color: back ? '#FFFFFF' : p.accent,
                  }}
                >
                  {back ? 'ANSWER' : 'QUESTION'}
                </Text>
                <ScrollView
                  style={ui.fill}
                  contentContainerStyle={{
                    flexGrow: 1,
                    justifyContent: 'center',
                    paddingVertical: 16,
                  }}
                  nestedScrollEnabled
                >
                  <Text
                    style={{
                      fontFamily: SkillFonts.semibold,
                      fontSize: back ? 22 : 26,
                      lineHeight: 34,
                      color: back ? '#FFFFFF' : p.text,
                    }}
                  >
                    {back ? queue[index].answer : queue[index].question}
                  </Text>
                </ScrollView>
                <Text
                  style={{
                    fontFamily: SkillFonts.body,
                    fontSize: 13,
                    color: back ? '#FFFFFF' : p.muted,
                  }}
                >
                  {back
                    ? 'How well did you remember?'
                    : 'Tap to reveal the answer'}
                </Text>
              </View>
            ))}
          </Animated.View>
        </TouchableOpacity>
        {flipped ? (
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: 8,
              marginTop: 18,
            }}
          >
            {(['Again', 'Hard', 'Good', 'Easy'] as Rating[]).map(r => (
              <View key={r} style={{flex: 1, minWidth: 68}}>
                <SkillButton secondary label={r} onPress={() => rate(r)} />
                <SkillText muted size={11} center>
                  {r === 'Again'
                    ? '1 min'
                    : r === 'Hard'
                    ? '10 min+'
                    : r === 'Good'
                    ? '1 day+'
                    : '4 days+'}
                </SkillText>
              </View>
            ))}
          </View>
        ) : (
          <SkillButton
            secondary
            label="Reveal answer"
            onPress={() => setFlipped(true)}
          />
        )}
        <SkillButton
          secondary
          label="End study session"
          onPress={() => {
            setStudying(false);
            setDeckId(null);
          }}
        />
        {!!error && <SkillText muted>{error}</SkillText>}
      </>
    );
  return (
    <>
      {!creating && (
        <>
          <View style={ui.section}>
            <SkillText strong size={22}>
              Your decks
            </SkillText>
            <SkillText muted>
              A little practice, a little more remembered.
            </SkillText>
          </View>
          {!decks.length && (
            <SkillCard>
              <SkillText strong>No decks yet</SkillText>
              <SkillText muted>
                Create your first card or turn your notes into a deck.
              </SkillText>
            </SkillCard>
          )}
          {decks.map(d => (
            <SkillCard key={d.id}>
              <View style={ui.between}>
                <SkillText strong size={17}>
                  {d.title}
                </SkillText>
                <SkillText muted size={12}>
                  {d.cards.length} cards
                </SkillText>
              </View>
              <SkillText muted>
                {d.cards.filter(c => c.dueAt <= Date.now()).length} due today
              </SkillText>
              <SkillButton label="Study deck" onPress={() => start(d)} />
              <View style={ui.row}>
                <View style={ui.fill}>
                  <SkillButton
                    secondary
                    label="Add cards"
                    onPress={() => {
                      setDeckId(d.id);
                      setCreating(true);
                      setError('');
                    }}
                  />
                </View>
                <View style={ui.fill}>
                  <SkillButton
                    secondary
                    label="Delete deck"
                    onPress={() =>
                      Alert.alert('Delete deck?', d.title, [
                        {text: 'Cancel', style: 'cancel'},
                        {
                          text: 'Delete',
                          style: 'destructive',
                          onPress: () => {
                            try {
                              persist(decks.filter(x => x.id !== d.id));
                            } catch (e) {
                              setError((e as Error).message);
                            }
                          },
                        },
                      ])
                    }
                  />
                </View>
              </View>
            </SkillCard>
          ))}
          <SkillButton
            label="Create a deck"
            onPress={() => {
              setDeckId(null);
              setTitle('');
              setCreating(true);
              setError('');
            }}
          />
        </>
      )}
      {creating && (
        <>
          <SkillInput
            label="Deck name"
            value={deck?.title ?? title}
            editable={!deck}
            onChangeText={setTitle}
            maxLength={120}
          />
          <Choices
            label="Create cards"
            values={['Manual', 'From notes'] as const}
            value={method}
            onChange={setMethod}
          />
          {method === 'Manual' ? (
            <>
              <SkillInput
                label="Question"
                value={question}
                onChangeText={setQuestion}
                multiline
                maxLength={2000}
              />
              <SkillInput
                label="Answer"
                value={answer}
                onChangeText={setAnswer}
                multiline
                maxLength={5000}
              />
            </>
          ) : (
            <SourcePicker
              userId={userId}
              source={source}
              onChange={setSource}
            />
          )}
          <SkillButton
            disabled={busy}
            label={
              busy
                ? 'Creating cards…'
                : method === 'Manual'
                ? 'Save card'
                : 'Create with LAFINA'
            }
            onPress={() => {
              void add();
            }}
          />
          <SkillButton
            secondary
            label="Cancel"
            disabled={busy}
            onPress={() => setCreating(false)}
          />
        </>
      )}
      {!!error && <SkillText muted>{error}</SkillText>}
    </>
  );
}
