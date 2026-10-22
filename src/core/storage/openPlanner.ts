import {openLocalDatabase} from './openLocalDatabase';
import {createPlannerRepository} from './plannerRepository';

export function openPlanner() {
  return createPlannerRepository(openLocalDatabase());
}
