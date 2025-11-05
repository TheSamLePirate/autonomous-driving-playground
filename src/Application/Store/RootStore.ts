import { ApplicationStore } from "./ApplicationStore";
import { CarStore } from "./CarStore";
import { LearningStore } from "./LearningStore";

export class RootStore {
  carStore: CarStore;
  applicationStore: ApplicationStore;
  learningStore: LearningStore;

  constructor() {
    this.carStore = new CarStore();
    this.applicationStore = new ApplicationStore();
    this.learningStore = new LearningStore();
  }
}

export const rootStore = new RootStore();
