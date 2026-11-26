import React, {useCallback, useEffect, useRef, useState} from 'react';
import {BackHandler, View} from 'react-native';
import {generateId} from '../../../utils';
import {NotesScreen} from '../notes/NotesScreen';
import type {NotesScreenProps, NotesSubTab} from '../notes/types';
import {useScreenActive} from '../../navigation/RetainedTab';
import {useSkillsPalette} from '../../theme/skills';
import {SkillsHub, SKILLS} from './SkillsHub';
import type {SkillRoute} from './SkillsHub';
import {SkillPage, ui} from './SkillUI';
import {AllSkillsView} from './AllSkillsView';
import {PomodoroSkill} from './PomodoroSkill';
import {FlashcardsSkill} from './FlashcardsSkill';
import {GwaSkill} from './GwaSkill';
import {QuizSkill} from './QuizSkill';
import type {QuizInitialHandoff} from './QuizSkill';
import {SummarizerSkill} from './SummarizerSkill';
import {DocGenSkill} from './DocGenSkill';
import {MeetingsSkill} from './MeetingsSkill';
import {LessonQaSkill} from './LessonQaSkill';
import {
  MeetingsProvider,
  useMeetingsProvided,
} from '../../contexts/MeetingsContext';
import type {SkillLaunchRequest} from '../../../skills/skillLaunch';

/** The persisted root route stays `notes`; Skills is its new visible name. */
// Memoized like the other tab roots: a tab switch elsewhere does not
// re-render Skills (App passes it only stable props).
export const SkillsScreen = React.memo(function SkillsScreenView(
  props: NotesScreenProps,
) {
  const meetingsProvided = useMeetingsProvided();
  if (meetingsProvided) {
    return <SkillsContent {...props} />;
  }
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
  const back = useCallback(() => {
    setRequest(undefined);
    setFlashcardDeckId(null);
    setLaunch(null);
    setQuizHandoff(null);
    setSkillMaterialId(undefined);
    if (returnRoute) {
      const target = returnRoute;
      setReturnRoute(null);
      setRoute(target);
      return;
    }
    setRoute('hub');
  }, [returnRoute]);

  useEffect(() => {
    backInterceptorRef.current = null;
  }, [route]);

  useEffect(() => {
    if (!active || route === 'hub' || route === 'flashcards') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (
        (route === 'materials' || route === 'docgen' || route === 'quiz') &&
        backInterceptorRef.current?.()
      ) {
        return true;
      }
      back();
      return true;
    });
    return () => sub.remove();
  }, [active, route, back]);

  const registerBackHandler = useCallback(
    (fn: (() => boolean) | null) => {
      backInterceptorRef.current = fn;
    },
    [],
  );

  const handleHubOpen = useCallback((r: SkillRoute) => {
    setRequest(undefined);
    setReturnRoute(null);
    setFlashcardDeckId(null);
    setSkillMaterialId(undefined);
    setRoute(r);
  }, []);

  const handleHubOpenMaterial = useCallback((matId: string) => {
    setRequest(undefined);
    setReturnRoute(null);
    setFlashcardDeckId(null);
    setSkillMaterialId(matId);
    setRoute('materials');
  }, []);

  const handleHubOpenDeck = useCallback((id: string) => {
    setRequest(undefined);
    setReturnRoute(null);
    setSkillMaterialId(undefined);
    setFlashcardDeckId(id);
    setRoute('flashcards');
  }, []);

  const handleHubEntity = useCallback(
    (kind: 'task' | 'note', id: string) => {
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
    },
    [props.userId],
  );

  const handleRecordMeeting = useCallback(() => setRoute('meetings'), []);
  const handleNotesOpenRequestHandled = useCallback((id: string) => {
    setRequest(undefined);
    openRequestHandled.current?.(id);
  }, []);

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
          isVisible={route === 'hub' && active}
          onOpen={handleHubOpen}
          onOpenMaterial={handleHubOpenMaterial}
          onOpenDeck={handleHubOpenDeck}
          onEntity={handleHubEntity}
        />
      </View>
      {isEssential && (
        <NotesScreen
          key={route}
          {...props}
          initialSubTab={route as NotesSubTab}
          onBackToSkills={back}
          onRecordMeeting={handleRecordMeeting}
          openRequest={request}
          onOpenRequestHandled={handleNotesOpenRequestHandled}
        />
      )}
      {route === 'materials' && (
        <LessonQaSkill
          key={props.userId}
          userId={props.userId}
          initialMaterialId={skillMaterialId}
          onRefresh={props.onRefresh}
          onBack={back}
          registerBackHandler={registerBackHandler}
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
            key={route}
            title={
              route === 'all'
                ? 'All skills'
                : SKILLS.find(s => s.id === route)?.title ?? 'Skills'
            }
            onBack={back}
          >
            {route === 'all' ? (
              <AllSkillsView onSelect={setRoute} />
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
                registerBackHandler={registerBackHandler}
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
                registerBackHandler={registerBackHandler}
                onOpenProfile={props.onOpenProfile}
                onNavigateToRegister={props.onNavigateToRegister}
              />
            ) : null}
          </SkillPage>
        )}
    </View>
  );
}
