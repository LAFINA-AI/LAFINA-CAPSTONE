import React, {useState} from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  formatNextDueIn,
  getDeckStats,
  type Deck,
  type StudyCard,
} from '../../../skills/studyLogic';
import {useSkillsPalette} from '../../theme/skills';
import {SkillButton, SkillCard, SkillInput, SkillText, ui} from './SkillUI';

interface StudyDeckDetailProps {
  deck: Deck;
  now: number;
  error: string;
  notice?: string;
  onClearError: () => void;
  onClearNotice?: () => void;
  onStudy: (deck: Deck, all: boolean) => void;
  onAddCards: (deck: Deck) => void;
  onRenameDeck: (deckId: string, nextTitle: string) => boolean;
  onEditCard: (
    deckId: string,
    cardId: string,
    question: string,
    answer: string,
  ) => boolean;
  onDeleteCard: (deckId: string, cardId: string) => void;
  onDeleteDeck: (deck: Deck) => void;
  onBack: () => void;
  onOpenNote?: (noteId: string) => void;
}

export function StudyDeckDetail({
  deck,
  now,
  error,
  notice,
  onClearError,
  onClearNotice,
  onStudy,
  onAddCards,
  onRenameDeck,
  onEditCard,
  onDeleteCard,
  onDeleteDeck,
  onBack,
  onOpenNote,
}: StudyDeckDetailProps) {
  const p = useSkillsPalette();
  const [renaming, setRenaming] = useState(false);
  const [renameText, setRenameText] = useState(deck.title);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editQuestion, setEditQuestion] = useState('');
  const [editAnswer, setEditAnswer] = useState('');
  const [cardQuery, setCardQuery] = useState('');

  const stats = getDeckStats(deck, now);
  const nextDueHint = formatNextDueIn(stats.nextDueAt, now);
  const normalizedQuery = cardQuery.trim().toLowerCase();
  const indexedCards = deck.cards.map((card, cardIdx) => ({card, cardIdx}));
  const visibleCards = normalizedQuery
    ? indexedCards.filter(
        ({card}) =>
          card.question.toLowerCase().includes(normalizedQuery) ||
          card.answer.toLowerCase().includes(normalizedQuery),
      )
    : indexedCards;

  const confirmDeleteCard = (card: StudyCard) => {
    Alert.alert('Delete card?', 'Remove this card from the deck?', [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          if (editingCardId === card.id) {
            setEditingCardId(null);
          }
          onDeleteCard(deck.id, card.id);
        },
      },
    ]);
  };

  const confirmDeleteDeck = () => {
    Alert.alert('Delete deck?', deck.title, [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => onDeleteDeck(deck),
      },
    ]);
  };

  return (
    <KeyboardAvoidingView
      style={ui.fill}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={ui.content}
      >
        {!!notice && (
          <SkillCard style={{borderColor: p.mintInk, backgroundColor: p.mint}}>
            <View style={ui.between}>
              <View style={ui.fill}>
                <SkillText strong size={13}>
                  {notice}
                </SkillText>
              </View>
              {onClearNotice && (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Dismiss notice"
                  onPress={onClearNotice}
                  style={{
                    minHeight: 44,
                    justifyContent: 'center',
                    paddingLeft: 8,
                  }}
                >
                  <SkillText muted size={12}>
                    Dismiss
                  </SkillText>
                </TouchableOpacity>
              )}
            </View>
          </SkillCard>
        )}
        <SkillCard>
          <View style={ui.between}>
            <View style={ui.fill}>
              <SkillText strong size={16}>
                Deck overview
              </SkillText>
            </View>
            <SkillText muted size={12}>
              {stats.total} {stats.total === 1 ? 'card' : 'cards'}
            </SkillText>
          </View>
          <SkillText muted>
            {stats.total === 0
              ? 'No cards yet'
              : stats.due > 0
              ? `${stats.due} due today`
              : 'All caught up today'}
          </SkillText>
          {stats.due === 0 && !!nextDueHint && (
            <SkillText muted size={12}>
              {nextDueHint}
            </SkillText>
          )}
          {stats.total > 0 && (
            <View style={[ui.row, {flexWrap: 'wrap', gap: 8}]}>
              <View
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 10,
                  backgroundColor: p.surface,
                }}
              >
                <SkillText size={12} muted>
                  New: {stats.newCount}
                </SkillText>
              </View>
              <View
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 10,
                  backgroundColor: p.blueSoft,
                }}
              >
                <SkillText size={12}>Learning: {stats.learningCount}</SkillText>
              </View>
              <View
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 10,
                  backgroundColor: p.mint,
                }}
              >
                <SkillText size={12}>Mastered: {stats.masteredCount}</SkillText>
              </View>
            </View>
          )}
          {stats.total > 0 &&
            (stats.due > 0 ? (
              <View style={ui.row}>
                <View style={ui.fill}>
                  <SkillButton
                    label="Study deck"
                    onPress={() => onStudy(deck, false)}
                  />
                </View>
                {stats.due < stats.total && (
                  <SkillButton
                    secondary
                    label={`Study all (${stats.total})`}
                    onPress={() => onStudy(deck, true)}
                  />
                )}
              </View>
            ) : (
              <>
                <SkillButton
                  label="Study all cards"
                  onPress={() => onStudy(deck, true)}
                />
                <SkillText muted size={12}>
                  Practice mode does not push back future review dates.
                </SkillText>
              </>
            ))}
          <View style={ui.row}>
            <View style={ui.fill}>
              <SkillButton
                secondary
                label="Add cards"
                onPress={() => onAddCards(deck)}
              />
            </View>
            <View style={ui.fill}>
              <SkillButton secondary label="Hide cards" onPress={onBack} />
            </View>
          </View>
          {renaming ? (
            <View style={{gap: 8}}>
              <SkillInput
                label="Rename deck"
                value={renameText}
                onChangeText={setRenameText}
                maxLength={120}
              />
              <View style={ui.row}>
                <View style={ui.fill}>
                  <SkillButton
                    label="Save name"
                    onPress={() => {
                      if (onRenameDeck(deck.id, renameText)) {
                        setRenaming(false);
                      }
                    }}
                  />
                </View>
                <View style={ui.fill}>
                  <SkillButton
                    secondary
                    label="Cancel"
                    onPress={() => {
                      setRenaming(false);
                      setRenameText(deck.title);
                      onClearError();
                    }}
                  />
                </View>
              </View>
            </View>
          ) : (
            <View style={ui.between}>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={`Rename deck ${deck.title}`}
                onPress={() => {
                  setRenaming(true);
                  setRenameText(deck.title);
                  onClearError();
                }}
                style={{
                  minHeight: 44,
                  justifyContent: 'center',
                  paddingRight: 12,
                }}
              >
                <SkillText strong size={13}>
                  Rename deck
                </SkillText>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={`Delete deck ${deck.title}`}
                onPress={confirmDeleteDeck}
                style={{
                  minHeight: 44,
                  justifyContent: 'center',
                  paddingLeft: 12,
                }}
              >
                <SkillText danger size={13}>
                  Delete deck
                </SkillText>
              </TouchableOpacity>
            </View>
          )}
        </SkillCard>

        {!!error && <SkillText danger>{error}</SkillText>}

        {deck.cards.length >= 6 && (
          <SkillInput
            label="Search cards"
            placeholder="Filter by question or answer…"
            value={cardQuery}
            onChangeText={setCardQuery}
            maxLength={120}
          />
        )}

        {deck.cards.length === 0 ? (
          <SkillCard>
            <SkillText muted size={13}>
              No cards in this deck yet.
            </SkillText>
          </SkillCard>
        ) : visibleCards.length === 0 ? (
          <SkillCard>
            <SkillText muted size={13}>
              No cards match this search.
            </SkillText>
          </SkillCard>
        ) : (
          visibleCards.map(({card, cardIdx}) => {
            const editing = editingCardId === card.id;
            return (
              <View
                key={card.id}
                style={{
                  padding: 14,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: p.border,
                  backgroundColor: p.card,
                  marginVertical: 6,
                  gap: 8,
                }}
              >
                {editing ? (
                  <>
                    <SkillInput
                      label={`Edit question ${cardIdx + 1}`}
                      value={editQuestion}
                      onChangeText={setEditQuestion}
                      multiline
                      maxLength={2000}
                    />
                    <SkillInput
                      label={`Edit answer ${cardIdx + 1}`}
                      value={editAnswer}
                      onChangeText={setEditAnswer}
                      multiline
                      maxLength={5000}
                    />
                    <View style={ui.row}>
                      <View style={ui.fill}>
                        <SkillButton
                          label="Save changes"
                          onPress={() => {
                            if (
                              onEditCard(
                                deck.id,
                                card.id,
                                editQuestion,
                                editAnswer,
                              )
                            ) {
                              setEditingCardId(null);
                              setEditQuestion('');
                              setEditAnswer('');
                            }
                          }}
                        />
                      </View>
                      <View style={ui.fill}>
                        <SkillButton
                          secondary
                          label="Cancel"
                          onPress={() => {
                            setEditingCardId(null);
                            onClearError();
                          }}
                        />
                      </View>
                    </View>
                  </>
                ) : (
                  <>
                    <View style={ui.between}>
                      <View style={ui.fill}>
                        <SkillText strong size={14}>
                          {cardIdx + 1}. {card.question}
                        </SkillText>
                      </View>
                      <SkillText muted size={11}>
                        {card.reviews === 0
                          ? 'New'
                          : card.intervalDays >= 7
                          ? 'Mastered'
                          : `${card.reviews} rev`}
                      </SkillText>
                    </View>
                    <SkillText muted size={13}>
                      {card.answer}
                    </SkillText>
                    {(card.sourceLabel || card.sourceNoteId) &&
                      (card.sourceNoteId && onOpenNote ? (
                        <TouchableOpacity
                          accessibilityRole="button"
                          accessibilityLabel={`Open source note ${
                            card.sourceLabel || ''
                          }`}
                          onPress={() => onOpenNote(card.sourceNoteId!)}
                          style={{
                            minHeight: 44,
                            justifyContent: 'center',
                            alignSelf: 'flex-start',
                          }}
                        >
                          <SkillText strong size={12}>
                            From: {card.sourceLabel || 'Open note'}
                          </SkillText>
                        </TouchableOpacity>
                      ) : (
                        <SkillText muted size={11}>
                          From: {card.sourceLabel}
                        </SkillText>
                      ))}
                    <View
                      style={[
                        ui.row,
                        {justifyContent: 'flex-end', gap: 12, marginTop: 2},
                      ]}
                    >
                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel={`Edit card ${cardIdx + 1}`}
                        onPress={() => {
                          setEditingCardId(card.id);
                          setEditQuestion(card.question);
                          setEditAnswer(card.answer);
                          onClearError();
                        }}
                        style={{
                          minHeight: 44,
                          minWidth: 56,
                          justifyContent: 'center',
                          alignItems: 'center',
                          paddingHorizontal: 8,
                        }}
                      >
                        <SkillText strong size={13}>
                          Edit
                        </SkillText>
                      </TouchableOpacity>
                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel={`Delete card ${cardIdx + 1}`}
                        onPress={() => confirmDeleteCard(card)}
                        style={{
                          minHeight: 44,
                          minWidth: 84,
                          justifyContent: 'center',
                          alignItems: 'center',
                          paddingHorizontal: 8,
                        }}
                      >
                        <SkillText danger size={13}>
                          Delete card
                        </SkillText>
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
