import React, {useEffect, useRef, useState} from 'react';
import {BackHandler, View} from 'react-native';
import {NotesScreen} from '../notes/NotesScreen';
import type {NotesScreenProps, NotesSubTab} from '../notes/types';
import {useScreenActive} from '../../navigation/RetainedTab';
import {useSkillsPalette} from '../../theme/skills';
import {SkillsHub, SKILLS} from './SkillsHub';
import type {SkillRoute} from './SkillsHub';
import {SkillButton, SkillPage, SkillText, ui} from './SkillUI';

/** The persisted root route stays `notes`; Skills is its new visible name. */
export function SkillsScreen(props: NotesScreenProps) {
  const p = useSkillsPalette();
  const active = useScreenActive();
  const [route, setRoute] = useState<SkillRoute>('hub');
  const [request, setRequest] = useState(props.openRequest);
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
  useEffect(() => {
    const r = props.openRequest;
    if (!r) return;
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
    if (!active || route === 'hub') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setRoute('hub');
      return true;
    });
    return () => sub.remove();
  }, [active, route]);
  const back = () => {
    setRequest(undefined);
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
            setRoute(r);
          }}
          onEntity={(kind, id) => {
            setRequest({
              requestId: `skills-${Date.now()}`,
              ownerId: props.userId,
              screen: 'notes',
              entityKind: kind,
              entityId: id,
            });
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
          openRequest={request}
          onOpenRequestHandled={id => {
            setRequest(undefined);
            props.onOpenRequestHandled?.(id);
          }}
        />
      )}
      {route !== 'hub' && !isEssential && (
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
          ) : (
            <SkillText>Preparing this skill.</SkillText>
          )}
        </SkillPage>
      )}
    </View>
  );
}
