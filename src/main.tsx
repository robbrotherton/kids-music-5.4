import { render } from "preact";
import { App } from "./App";
import "./styles.css";

const syncViewportHeight = () => {
  const nextHeight = window.visualViewport?.height ?? window.innerHeight;
  document.documentElement.style.setProperty("--app-height", `${Math.round(nextHeight)}px`);
};

syncViewportHeight();
window.addEventListener("resize", syncViewportHeight);
window.visualViewport?.addEventListener("resize", syncViewportHeight);
window.visualViewport?.addEventListener("scroll", syncViewportHeight);

render(<App />, document.getElementById("app")!);
