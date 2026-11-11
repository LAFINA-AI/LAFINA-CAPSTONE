import {deliveryStore} from '../storage/deliveryStore';
import {remindersStore} from '../storage/remindersStore';
import {reconcileReminderDelivery} from './deliveryReconciler';

/** A durable reminder row and an armed Android alarm are separate outcomes. */
export async function verifyReminderDelivery(
  ownerId: string,
  reminderId: string,
) {
  try {
    const reminder = remindersStore.getReminderById(reminderId);
    if (reminder?.userId !== ownerId) throw new Error('Reminder unavailable');
    const summary = await reconcileReminderDelivery(ownerId);
    const job = deliveryStore.get(reminderId);
    if (
      summary.nativeAvailable &&
      !summary.error &&
      job?.userId === ownerId &&
      job.state === 'armed' &&
      job.registrationState === 'registered' &&
      job.registeredGeneration === job.generation
    ) {
      return {
        status: 'registered' as const,
        message: 'Saved locally. Alarm registered.',
      };
    }
    return {
      status: 'pending' as const,
      message:
        'Saved locally. Alarm delivery is pending; check reminder permissions.',
    };
  } catch {
    return {
      status: 'unavailable' as const,
      message:
        'Saved locally. Alarm delivery could not be verified; open reminder delivery settings.',
    };
  }
}
