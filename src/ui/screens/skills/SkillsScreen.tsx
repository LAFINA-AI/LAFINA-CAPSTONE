import React, {useCallback, useEffect, useRef, useState} from 'react';
import {BackHandler, View} from 'react-native';
import {generateId} from '../../../utils';
import {NotesScreen} from '../notes/NotesScreen';
import type {NotesScreenProps, NotesSubTab} from '../notes/types';
import {useScreenActive} from '../../navigation/RetainedTab';
import {useSkillsPalette} from '../../theme/skills';
import {SkillsHub, SKILLS} from './SkillsHub';
import type {SkillRoute} from './SkillsHub';
import {SkillButton, SkillPage, ui} from './SkillUI';
import {PomodoroSkill} from './PomodoroSkill';
import {FlashcardsSkill} from './FlashcardsSkill';
import {GwaSkill} from './GwaSkill';
import {QuizSkill} from './QuizSkill';
import type {QuizInitialHandoff} from './QuizSkill';
import {SummarizerSkill} from './SummarizerSkill';
import {DocGenSkill} from './DocGenSkill';
import {MeetingsSkill} from './MeetingsSkill';
import {LessonQaSkill} from './LessonQaSkill';
import {MeetingsProvider} from '../../contexts/MeetingsContext';
import type {SkillLaunchRequest} from '../../../skills/skillLaunch';

/** The persisted root route stays `notes`; Skills is its new visible name. */
// Memoized like the other tab roots: a tab switch elsewhere does not
// re-render Skills (App passes it only stable props).
export const SkillsScreen = React.memo(function SkillsScreenView(
  props: NotesScreenProps,
) {
  return (
    <MeetingsProvider
      key={props.userId}
      userId={props.userId}
      syncRevision={props.refreshTrigger}
    >
      <SkillsContent {...props} />
    </MeetingsProvider>
  );
});
function SkillsContent(props: NotesScreenProps) {
  const p = useSkillsPalette();
  const active = useScreenActive();
  const [route, setRoute] = useState<SkillRoute>('hub');
  const [flashcardDeckId, setFlashcardDeckId] = useState<string | null>(null);
  const [skillMaterialId, setSkillMaterialId] = useState<string | undefined>(
    undefined,
  );
  const backInterceptorRef = useRef<(() => boolean) | null>(null);
  const onPageChange = props.onSkillsPageChange;
  useEffect(() => {
    onPageChange?.(active && route !== 'hub');
    return () => onPageChange?.(false);
  }, [active, route, onPageChange]);
  const [request, setRequest] = useState(props.openRequest);
  const [returnRoute, setReturnRoute] = useState<SkillRoute | null>(null);
  const [quizHandoff, setQuizHandoff] = useState<QuizInitialHandoff | null>(
    null,
  );
  const clearQuizHandoff = useCallback(() => setQuizHandoff(null), []);
  const beforeTour = useRef<SkillRoute>('hub');
  const wasTour = useRef(false);
  useEffect(() => {
    if (props.tourSubTab) {
      if (!wasTour.current) beforeTour.current = route;
      wasTour.current = true;
      setRoute(props.tourSubTab);
    } else if (wasTour.current) {
      wasTour.current = false;
      setRoute(beforeTour.current);
    }
    // React only to tour transitions, not ordinary navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.tourSubTab]);
  const [launch, setLaunch] = useState<SkillLaunchRequest | null>(null);
  const openRequestHandled = useRef(props.onOpenRequestHandled);
  openRequestHandled.current = props.onOpenRequestHandled;
  const finishLaunch = useCallback(
    (id: string) => setLaunch(current => (current?.id === id ? null : current)),
    [],
  );
  useEffect(() => {
    const r = props.openRequest;
    if (!r) return;
    setReturnRoute(null);
    setSkillMaterialId(undefined);
    if (r.skill) {
      // A skill handoff from LAFINA (ADR-041): open that page once.
      const {skill} = r;
      setLaunch({...skill, id: r.requestId});
      setFlashcardDeckId(null);
      setSkillMaterialId(skill.materialId);
      const essential =
        skill.skill === 'alarms' ||
        skill.skill === 'todo' ||
        skill.skill === 'notes';
      setRequest(
        essential
          ? {
              requestId: r.requestId,
              ownerId: r.ownerId,
              screen: 'notes',
              notesTab: skill.skill as 'alarms' | 'todo' | 'notes',
            }
          : undefined,
      );
      setRoute(skill.skill);
      if (!essential) openRequestHandled.current?.(r.requestId);
      return;
    }
    setLaunch(null);
    setRequest(r);
    setRoute(
      r.notesTab === 'alarms' || r.scheduleSection === 'alarms'
        ? 'alarms'
        : r.notesTab === 'todo' || r.entityKind === 'task'
        ? 'todo'
        : 'notes',
    );
  }, [props.openRequest]);
  useEffect(() => {
    if (!active || route === 'hub' || route === 'flashcards') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (route === 'materials' && backInterceptorRef.current?.()) {
        return true;
      }
      setRequest(undefined);
      setSkillMaterialId(undefined);
      if (returnRoute) {
        const target = returnRoute;
        setReturnRoute(null);
        setRoute(target);
        return true;
      }
      setRoute('hub');
      return true;
    });
    return () => sub.remove();
  }, [active, route, returnRoute]);
  const back = () => {
    setRequest(undefined);
    setFlashcardDeckId(null);
    setSkillMaterialId(undefined);
    if (returnRoute) {
      const target = returnRoute;
      setReturnRoute(null);
      setRoute(target);
      return;
    }
    setRoute('hub');
  };
  const isEssential =
    route === 'alarms' || route === 'todo' || route === 'notes';
  return (
    <View style={[ui.fill, {backgroundColor: p.bg}]}>
      <View
        style={[ui.fill, route !== 'hub' && {display: 'none'}]}
        accessibilityElementsHidden={route !== 'hub'}
        importantForAccessibility={
          route === 'hub' ? 'auto' : 'no-hide-descendants'
        }
      >
        <SkillsHub
          userId={props.userId}
          refreshTrigger={props.refreshTrigger}
          onOpen={r => {
            setRequest(undefined);
            setReturnRoute(null);
            setFlashcardDeckId(null);
            setSkillMaterialId(undefined);
            setRoute(r);
          }}
          onOpenMaterial={matId => {
            setRequest(undefined);
            setReturnRoute(null);
            setFlashcardDeckId(null);
            setSkillMaterialId(matId);
            setRoute('materials');
          }}
          onOpenDeck={id => {
            setRequest(undefined);
            setReturnRoute(null);
            setSkillMaterialId(undefined);
            setFlashcardDeckId(id);
            setRoute('flashcards');
          }}
          onEntity={(kind, id) => {
            setReturnRoute(null);
            setRequest({
              requestId: `skills-${Date.now()}`,
              ownerId: props.userId,
              screen: 'notes',
              entityKind: kind,
              entityId: id,
            });
            setSkillMaterialId(undefined);
            setRoute(kind === 'task' ? 'todo' : 'notes');
          }}
        />
      </View>
      {isEssential && (
        <NotesScreen
          key={route}
          {...props}
          initialSubTab={route as NotesSubTab}
          onBackToSkills={back}
          onRecordMeeting={() => setRoute('meetings')}
          openRequest={request}
          onOpenRequestHandled={id => {
            setRequest(undefined);
            props.onOpenRequestHandled?.(id);
          }}
        />
      )}
      {route === 'materials' && (
        <LessonQaSkill
          key={props.userId}
          userId={props.userId}
          initialMaterialId={skillMaterialId}
          onRefresh={props.onRefresh}
          onBack={back}
          registerBackHandler={fn => {
            backInterceptorRef.current = fn;
          }}
          onOpenSkill={(target, materialId) => {
            setReturnRoute(null);
            setSkillMaterialId(materialId);
            setRoute(target);
          }}
        />
      )}
      {route === 'flashcards' && (
        <FlashcardsSkill
          userId={props.userId}
          onBack={back}
          initialDeckId={flashcardDeckId}
          initialMaterialId={skillMaterialId}
          launch={launch?.skill === 'flashcards' ? launch : null}
          onLaunchHandled={finishLaunch}
          onInitialDeckConsumed={() => setFlashcardDeckId(null)}
          onQuiz={payload => {
            setReturnRoute(null);
            if (payload?.deck || payload?.source) {
              setQuizHandoff({
                nonce: generateId('quiz-handoff'),
                deck: payload.deck,
                source: payload.source,
              });
            }
            setRoute('quiz');
          }}
          onOpenNote={id => {
            setRequest({
              requestId: `flashcard-${Date.now()}`,
              ownerId: props.userId,
              screen: 'notes',
              entityKind: 'note',
              entityId: id,
            });
            setRoute('notes');
          }}
        />
      )}
      {route !== 'hub' &&
        !isEssential &&
        route !== 'materials' &&
        route !== 'flashcards' && (
          <SkillPage
            title={
              route === 'all'
                ? 'All skills'
                : SKILLS.find(s => s.id === route)?.title ?? 'Skills'
            }
            onBack={back}
          >
            {route === 'all' ? (
              SKILLS.map(s => (
                <SkillButton
                  key={s.id}
                  label={s.title}
                  secondary
                  onPress={() => setRoute(s.id)}
                />
              ))
            ) : route === 'pomodoro' ? (
              <PomodoroSkill
                userId={props.userId}
                launch={launch?.skill === 'pomodoro' ? launch : null}
                onLaunchHandled={finishLaunch}
                onOpenTodo={id => {
                  if (id)
                    setRequest({
                      requestId: `focus-${Date.now()}`,
                      ownerId: props.userId,
                      screen: 'notes',
                      entityKind: 'task',
                      entityId: id,
                    });
                  setRoute('todo');
                }}
              />
            ) : route === 'gwa' ? (
              <GwaSkill userId={props.userId} />
            ) : route === 'quiz' ? (
              <QuizSkill
                userId={props.userId}
                onFlashcards={() => {
                  setReturnRoute(null);
                  setRoute('flashcards');
                }}
                initialHandoff={quizHandoff}
                initialMaterialId={skillMaterialId}
                launch={launch?.skill === 'quiz' ? launch : null}
                onLaunchHandled={finishLaunch}
                onHandoffConsumed={clearQuizHandoff}
                onNote={id => {
                  setReturnRoute('quiz');
                  setRequest({
                    requestId: `quiz-${Date.now()}`,
                    ownerId: props.userId,
                    screen: 'notes',
                    entityKind: 'note',
                    entityId: id,
                  });
                  setRoute('notes');
                }}
              />
            ) : route === 'summarizer' ? (
              <SummarizerSkill
                userId={props.userId}
                initialMaterialId={skillMaterialId}
                onFlashcards={() => setRoute('flashcards')}
                onCreateDocument={() => setRoute('docgen')}
              />
            ) : route === 'meetings' ? (
              <MeetingsSkill userId={props.userId} onSaved={props.onRefresh} />
            ) : route === 'docgen' ? (
              <DocGenSkill
                userId={props.userId}
                refreshTrigger={props.refreshTrigger}
                initialMaterialId={skillMaterialId}
                launch={launch?.skill === 'docgen' ? launch : null}
                onLaunchHandled={finishLaunch}
                onOpenProfile={props.onOpenProfile}
                onNavigateToRegister={props.onNavigateToRegister}
              />
            ) : null}
          </SkillPage>
        )}
    </View>
  );
}
