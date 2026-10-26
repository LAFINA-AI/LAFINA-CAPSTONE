import {useEffect, useState} from 'react';
import type {PlannerRepository} from '../../core/domain/planner';
import {runPlannerSqlChecks} from '../../core/storage/runPlannerSqlChecks';
import {Button, Message} from '../../core/ui/controls';
import {PlannerHarness} from '../scheduling/PlannerHarness';

export function PlannerDiagnostics({
  factory,
  timezone,
}: {
  factory: () => PlannerRepository;
  timezone: string;
}) {
  const [repository, setRepository] = useState<PlannerRepository | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [sqlResult, setSqlResult] = useState('');
  const [sqlBusy, setSqlBusy] = useState(false);
  useEffect(() => {
    try {
      setRepository(factory());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [factory, attempt]);
  if (failed) {
    return (
      <>
        <Message
          error
          text="Planner storage could not be opened. Saved data has not been reset."
        />
        <Button
          label="Retry opening planner"
          onPress={() => setAttempt(value => value + 1)}
        />
      </>
    );
  }
  return repository ? (
    <>
      <Button
        label={
          sqlBusy ? 'Checking isolated SQLite…' : 'Run isolated SQLite checks'
        }
        disabled={sqlBusy}
        secondary
        onPress={() => {
          setSqlBusy(true);
          void runPlannerSqlChecks()
            .then(setSqlResult)
            .catch(() =>
              setSqlResult(
                'FAIL: native SQLite QA checks could not finish. Student data was not changed.',
              ),
            )
            .finally(() => setSqlBusy(false));
        }}
      />
      {sqlResult ? (
        <Message text={sqlResult} error={sqlResult.startsWith('FAIL')} />
      ) : null}
      <PlannerHarness repository={repository} timezone={timezone} />
    </>
  ) : (
    <Message text="Opening planner storage…" />
  );
}
