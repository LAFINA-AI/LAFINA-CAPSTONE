import React, {Activity, createContext, useContext, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {useStorageRevision} from '../hooks/useStorageRevision';

const ScreenActivity = createContext(true);
export const useScreenActive = () => useContext(ScreenActivity);

/** Native Modal portals need an explicit visibility boundary. Keep the activity
 * subscription here so tab activation does not rerender the whole screen.
 */
export function ScreenOverlays({children}: React.PropsWithChildren) {
  const active = useScreenActive();
  return (
    <>
      {React.Children.map(children, child => {
        if (active || !React.isValidElement<Record<string, unknown>>(child))
          return child;
        const props = child.props;
        if (props.visible === true)
          return React.cloneElement(child, {visible: false});
        const state = props.state;
        if (
          state &&
          typeof state === 'object' &&
          'visible' in state &&
          state.visible === true
        ) {
          return React.cloneElement(child, {state: {...state, visible: false}});
        }
        if (props.request) return React.cloneElement(child, {request: null});
        return child;
      })}
    </>
  );
}

/** Mount on first visit; preserve state and release effects while hidden.
 * The caller must key this boundary by account as well as tab.
 */
const RevisionScreen = React.memo(function RevisionScreenView({
  tables,
  children,
}: {
  tables: readonly string[];
  children: React.ReactElement<{refreshTrigger: number}> | null;
}) {
  const revision = useStorageRevision(tables);
  return children
    ? React.cloneElement(children, {refreshTrigger: revision})
    : null;
});

export const RetainedTab = React.memo(function RetainedTabView({
  active,
  children,
  tables,
}: {
  active: boolean;
  tables: readonly string[];
  children: React.ReactElement<{refreshTrigger: number}> | null;
}) {
  const [visited, setVisited] = useState(active);
  if (active && !visited) setVisited(true);
  if (!active && !visited) return null;
  return (
    <ScreenActivity.Provider value={active}>
      <Activity mode={active ? 'visible' : 'hidden'}>
        <View
          style={styles.screen}
          pointerEvents={active ? 'auto' : 'none'}
          accessibilityElementsHidden={!active}
          importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
        >
          <RevisionScreen tables={tables}>{children}</RevisionScreen>
        </View>
      </Activity>
    </ScreenActivity.Provider>
  );
});

const styles = StyleSheet.create({screen: {flex: 1}});
