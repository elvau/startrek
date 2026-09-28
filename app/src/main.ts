import { mount } from "svelte";
// Schriften von der eigenen Seite statt von Google (keine IP-Adressen an Google)
import "@fontsource-variable/figtree";
import "@fontsource-variable/bricolage-grotesque/opsz.css";
import "./styles/app.css";
import "./styles/editor.css";
import App from "./App.svelte";

export default mount(App, { target: document.getElementById("app")! });
