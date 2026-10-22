import type {PlannerRepository} from '../domain/planner';

/** A committed manual operation stays saved even if Android delivery fails. */
export function reconcilePlanner(
  repository: PlannerRepository,
  reconcile: () => Promise<unknown>,
  onError: () => void,
): PlannerRepository {
  let running = false;
  let requested = false;
  async function flush() {
    if (running) {
      return;
    }
    running = true;
    try {
      while (requested) {
        requested = false;
        try {
          await reconcile();
        } catch {
          onError();
        }
      }
    } finally {
      running = false;
    }
  }
  function changed<T>(operation: () => T): T {
    const result = operation();
    requested = true;
    void flush();
    return result;
  }
  return {
    ...repository,
    createTask: command => changed(() => repository.createTask(command)),
    updateTask: command => changed(() => repository.updateTask(command)),
    deleteTask: command => changed(() => repository.deleteTask(command)),
    createEvent: command => changed(() => repository.createEvent(command)),
    updateEvent: command => changed(() => repository.updateEvent(command)),
    deleteEvent: command => changed(() => repository.deleteEvent(command)),
    reminderAction: command =>
      changed(() => repository.reminderAction(command)),
  };
}
