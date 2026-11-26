import { registerRootComponent } from "expo";
import { App } from "./src/App";

// Imported for its side effect: TaskManager.defineTask must run at module scope, before React
// renders, because Android can start the process INTO the background task without ever showing
// the UI -- a task defined inside a component would not exist yet when that happens.
import "./src/location-task";

registerRootComponent(App);
