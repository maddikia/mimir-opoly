(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Wildwood = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const VERSION = 1;
  const RUN_VERSION = 2;
  const EVENT_REVISION = "20260924-casino60-auto";
  const OLD_EVENT_INTRO = "You thought this was an ordinary board game. Now you’re part of it.\n\nComplete the challenges and finish the game within 60 minutes, or GO DIRECTLY TO JAIL!\n\nKeep every clue, receipt, and bill you collect. You never know when the BANK might ask questions.\n\nPress START GAME when everyone is ready.";
  const clone = value => JSON.parse(JSON.stringify(value));
  const normalize = value => String(value).trim().replace(/\s+/g, " ").toUpperCase();
  const SPACE_TYPES = { property: "Property", chance: "Chance", community: "Community Chest", station: "Station", utility: "Utility" };
  const GROUPS = { auto: "Auto (by position)", brown: "Brown", "light-blue": "Light blue", pink: "Pink", orange: "Orange", red: "Red", yellow: "Yellow", green: "Green", "dark-blue": "Dark blue" };
  const LEGACY_GROUPS = { rose: "Rose (saved legacy color)", gold: "Gold (saved legacy color)", forest: "Forest (saved legacy color)", sky: "Sky (saved legacy color)", ink: "Ink (saved legacy color)", silver: "Silver (saved legacy color)" };
  const AUTO_GROUPS = ["brown", "light-blue", "pink", "orange", "red", "yellow", "green", "dark-blue"];
  function groupChoices(group) {
    return { ...GROUPS, ...(Object.hasOwn(LEGACY_GROUPS, group) ? { [group]: LEGACY_GROUPS[group] } : {}) };
  }
  function cardStyle(card, index = 0) {
    return {
      type: card.spaceType === undefined ? "property" : card.spaceType,
      group: card.group === undefined || card.group === "auto" ? AUTO_GROUPS[Math.floor(index / 2) % AUTO_GROUPS.length] : card.group
    };
  }
  const defaultConfig = {
    version: VERSION,
    movementMode: "auto",
    title: "The Wildwood Pact",
    durationMinutes: 60,
    intro: "What began as an ordinary board game has opened a path into the wildwood. Finish the trail within sixty minutes to find your way home. Solve each card to send your team's pawn onward. The next card turns itself over.",
    reviewed: false,
    cards: ["READY", "007", "NEXT", "TRAIL", "HOME", "FINISH"].map((answer, index) => ({
      id: `demo-${index + 1}`, title: `Demo card ${index + 1}`,
      prompt: "INTERFACE DEMO ONLY. Your own puzzle or physical-prop instructions go here. Ask the host for the sample answer. Answer correctly to move your pawn and automatically turn over the next card.",
      answers: [answer], hint: "This is a website demonstration, not a room puzzle. The host can view the sample answer or award this card.",
      demo: true, spaceType: ["property", "chance", "property", "community", "station", "utility"][index], group: "auto"
    }))
  };
  const eventConfig = {
    version: VERSION, presetId: "mimir-opoly-2026-09-24", eventRevision: EVENT_REVISION, title: "MIMIR-OPOLY",
    movementMode: "auto", durationMinutes: 60, reviewed: false,
    intro: "You thought this was an ordinary board game. Now you’re part of it.\n\nComplete the challenges and finish the game within 60 minutes, or GO DIRECTLY TO JAIL!\n\nPress START GAME when everyone is ready.",
    presentation: {
      openingTitle: "WELCOME TO MIMIR-OPOLY!", startLabel: "START GAME", minimalCards: true, boardTone: "mint",
      successTitle: "YOU ESCAPED MIMIR-OPOLY!",
      successText: "No jail time today! You successfully finished the game and can attend your team morale event in peace.\n\nBest of all: FREE SNACKS!",
      timeoutTitle: "TIME’S UP! GO DIRECTLY TO JAIL!",
      timeoutText: "The game has claimed its newest residents. Call your game host for your release hearing."
    },
    cards: [
      { id: "casino", boardLabel: "Community Chest", spaceType: "community", group: "auto", title: "CASINO WINNINGS",
        prompt: "You get pulled into a casino game! Complete the challenge and report how much you won. Your first clue is behind the TV.",
        emphasis: ["behind the TV"], answers: ["60", "$60", "+60"], hint: "", demo: false },
      { id: "railroad", boardLabel: "????? Railroad", spaceType: "station", group: "auto", title: "",
        prompt: "Identify the mystery railroad.", answers: ["MINE"], hint: "", demo: false,
        reveal: { kind: "identify-property", answers: ["READING", "READING RAILROAD"], name: "READING RAILROAD", boardLabel: "Reading Railroad", price: "$275" } },
      { id: "laundry", boardLabel: "Chance", spaceType: "chance", group: "auto", title: "LAUNDRY EMERGENCY!",
        prompt: "Your washing machine broke down! Determine the repair fee and make your payment at LAUNDRY REPAIR.",
        emphasis: ["LAUNDRY REPAIR"], answers: ["CLEAN"], hint: "", demo: false },
      { id: "building-32", boardLabel: "Building 32", spaceType: "property", group: "dark-blue", branding: "microsoft",
        title: "WHERE ARE WE SUPPOSED TO BE?", prompt: "You made it to work—but where are you supposed to be next?",
        answers: ["MORALE EVENT AT THE COMMONS"], hint: "", demo: false },
      { id: "bank-audit", boardLabel: "Chance", spaceType: "chance", group: "auto", title: "BANK AUDIT!",
        prompt: "The BANK wants a closer look at your money.", answers: ["FREE SNACKS"], hint: "", demo: false, finishOnSolve: true }
    ]
  };
  function eventUpdateFields(config) {
    if (config.presetId !== eventConfig.presetId || config.eventRevision !== undefined) return [];
    const fields = [];
    const casino = config.cards.find(card => card.id === "casino");
    if (casino && casino.answers.length === 3 && new Set(casino.answers).size === 3 &&
        casino.answers.every(value => ["10", "$10", "+10"].includes(value))) fields.push("casino");
    if (config.movementMode === "manual") fields.push("movement");
    if (config.intro === OLD_EVENT_INTRO) fields.push("intro");
    return fields;
  }
  function upgradedEventConfig(config) {
    const result = clone(config);
    const fields = eventUpdateFields(config);
    if (fields.includes("casino")) result.cards.find(card => card.id === "casino").answers = ["60", "$60", "+60"];
    if (fields.includes("movement")) result.movementMode = "auto";
    if (fields.includes("intro")) result.intro = eventConfig.intro;
    if (fields.length) result.eventRevision = EVENT_REVISION;
    return result;
  }
  function eventUpdateTargets(state) {
    return [{ target: "saved setup", config: state.config }, ...(state.run ? [{ target: "run snapshot", config: state.run.config }] : [])]
      .map(item => ({ target: item.target, fields: eventUpdateFields(item.config) })).filter(item => item.fields.length);
  }
  function applyEventUpdate(state, now = Date.now()) {
    validateConfig(state.config);
    if (state.run) validateRun(state.run);
    const result = clone(state);
    const targets = eventUpdateTargets(state);
    result.config = upgradedEventConfig(result.config);
    if (result.run) {
      const fields = eventUpdateFields(result.run.config);
      result.run.config = upgradedEventConfig(result.run.config);
      if (fields.includes("movement") && result.run.version === RUN_VERSION) {
        result.run.movementMode = "auto";
        // One already-earned move is explicit in the host's confirmation.
        if (result.run.phase === "solved") continuePlay(result.run, now);
      }
      validateRun(result.run);
    }
    return { state: result, targets };
  }
  function check(condition, message) { if (!condition) throw new Error(message); }
  function string(value, label, max, allowEmpty = false) {
    check(typeof value === "string" && value.length <= max && (allowEmpty || value.trim().length > 0), `${label} must be ${allowEmpty ? "" : "nonempty "}text, at most ${max} characters.`);
  }
  function answerList(value, label) {
    check(Array.isArray(value) && value.length <= 20, `${label} must be a list of up to 20 strings.`);
    value.forEach(answer => string(answer, label, 300));
  }
  function completeCard(card) {
    return card.prompt.trim() && card.answers.length && (!card.reveal || (card.reveal.answers.length && card.reveal.name.trim() && card.reveal.price.trim()));
  }
  function validateConfig(input) {
    check(input && input.version === VERSION, "Unsupported setup version. Expected version 1.");
    string(input.title, "Game title", 100);
    string(input.intro, "Opening text", 6000, true);
    check(Number.isInteger(input.durationMinutes) && input.durationMinutes >= 1 && input.durationMinutes <= 180, "Duration must be a whole number from 1 to 180 minutes.");
    check(typeof input.reviewed === "boolean", "The setup review flag is missing.");
    if (input.movementMode !== undefined) check(["manual", "auto"].includes(input.movementMode), "Movement must be manual or auto.");
    if (input.presetId !== undefined) string(input.presetId, "Preset ID", 100);
    if (input.eventRevision !== undefined) string(input.eventRevision, "Event revision", 100);
    if (input.hostNotes !== undefined) string(input.hostNotes, "Host notes", 12000, true);
    if (input.presentation !== undefined) {
      const style = input.presentation;
      check(style && typeof style === "object" && !Array.isArray(style), "Presentation must be an object.");
      for (const field of ["openingTitle", "startLabel", "successTitle", "successText", "timeoutTitle", "timeoutText"]) string(style[field], `Presentation ${field}`, field === "startLabel" ? 60 : 6000);
      check(typeof style.minimalCards === "boolean", "Minimal card presentation must be true or false.");
      check(["mint", "white"].includes(style.boardTone), "Board tone must be mint or white.");
    }
    check(Array.isArray(input.cards) && input.cards.length <= 24, "Use up to 24 cards.");
    const ids = new Set();
    input.cards.forEach((card, index) => {
      string(card.id, "Card ID", 80);
      check(/^[a-zA-Z0-9_-]+$/.test(card.id) && !ids.has(card.id), "Card IDs must be unique and use only letters, numbers, underscores or hyphens.");
      ids.add(card.id);
      string(card.title, "Card title", 150, true);
      string(card.prompt, "Card instructions", 12000, true);
      check(Array.isArray(card.answers) && card.answers.length <= 20, "Use up to 20 accepted answers per card.");
      card.answers.forEach(answer => string(answer, "Accepted answer (must be a string to preserve leading zeros)", 300));
      string(card.hint, "Hint", 3000, true);
      check(typeof card.demo === "boolean", "Every card needs a demo/placeholder flag.");
      if (card.spaceType !== undefined) check(typeof card.spaceType === "string" && Object.hasOwn(SPACE_TYPES, card.spaceType), "Unknown space type. Choose Property, Chance, Community Chest, Station or Utility.");
      if (card.group !== undefined) check(typeof card.group === "string" && (Object.hasOwn(GROUPS, card.group) || Object.hasOwn(LEGACY_GROUPS, card.group)), "Unknown property group. Choose a group from the editor.");
      if (card.boardLabel !== undefined) string(card.boardLabel, "Public board label", 100, true);
      if (card.emphasis !== undefined) answerList(card.emphasis, "Emphasized phrases");
      if (card.branding !== undefined) check(["none", "microsoft"].includes(card.branding), "Unknown card branding.");
      if (card.finishOnSolve !== undefined) {
        check(typeof card.finishOnSolve === "boolean", "Finish-on-solve must be true or false.");
        check(!card.finishOnSolve || index === input.cards.length - 1, "An immediate-finish card must be the last card. Move it last or uncheck Finish immediately.");
      }
      if (card.reveal !== undefined) {
        check(card.reveal && card.reveal.kind === "identify-property", "Unsupported identification/reveal type.");
        answerList(card.reveal.answers, "Identification answers");
        string(card.reveal.name, "Revealed property name", 150, true);
        string(card.reveal.boardLabel, "Revealed board label", 100, true);
        string(card.reveal.price, "Revealed property price", 100, true);
      }
    });
    return clone(input);
  }
  function readiness(config) {
    const issues = [];
    if (!config.cards.length) issues.push("Add at least one card.");
    config.cards.forEach((card, i) => {
      if (!card.prompt.trim()) issues.push(`Card ${i + 1}: add your puzzle instructions.`);
      if (!card.answers.length) issues.push(`Card ${i + 1}: add at least one accepted answer.`);
      if (card.demo) issues.push(`Card ${i + 1}: replace the demo/placeholder and mark it as your actual card.`);
      if (card.reveal && !completeCard(card)) issues.push(`Card ${i + 1}: finish the identification answers, revealed name and price.`);
    });
    if (!config.reviewed) issues.push("Confirm you tested the cards and will keep room doors unlocked.");
    return issues;
  }
  const currentCard = run => run.config.cards[run.index];
  const movementMode = run => run.version === 1 ? "auto" : run.movementMode;
  const identified = (run, card) => Boolean(run && run.identified && run.identified.includes(card.id));
  function cardView(run, card, index = 0) {
    const revealed = card.reveal && identified(run, card);
    return {
      title: revealed ? card.reveal.name : card.title,
      prompt: revealed ? "" : card.prompt,
      boardLabel: revealed ? card.reveal.boardLabel || card.reveal.name : card.boardLabel || SPACE_TYPES[cardStyle(card, index).type],
      price: revealed ? card.reveal.price : null,
      emphasis: revealed ? [] : card.emphasis || [],
      branding: card.branding || "none"
    };
  }
  function remaining(run, now = Date.now()) {
    return run.status === "running" ? Math.max(0, run.deadline - now) : run.remainingMs;
  }
  function tick(run, now = Date.now()) {
    if (run.status === "running" && remaining(run, now) === 0) {
      run.status = "timeout"; run.remainingMs = 0; run.deadline = null;
      return true;
    }
    return false;
  }
  function start(config, mode, now = Date.now()) {
    config = validateConfig(config);
    check(["demo", "live"].includes(mode), "Choose demo or live play.");
    check(config.cards.length > 0, "Add at least one card before beginning.");
    check(config.cards.every(completeCard), "Every card needs instructions and answers; identification cards also need reveal details, even in demo play.");
    check(mode !== "live" || readiness(config).length === 0, "Live play is blocked. Replace demo cards and complete the setup review.");
    return {
      version: RUN_VERSION, config, mode, movementMode: config.movementMode || "manual", identified: [], status: "running", index: 0, phase: "undrawn",
      startedAt: now, deadline: now + config.durationMinutes * 60000, remainingMs: config.durationMinutes * 60000,
      completed: [], overrides: [], hints: [], finalTimeMs: null
    };
  }
  function draw(run, cardId, now = Date.now()) {
    tick(run, now);
    if (run.status !== "running" || run.phase !== "undrawn" || currentCard(run).id !== cardId) return false;
    run.phase = "drawn";
    return true;
  }
  function submit(run, cardId, answer, now = Date.now(), override = false) {
    tick(run, now);
    if (run.status !== "running") return { ok: false, message: "The game is not running. Ask the host to resume." };
    if (!currentCard(run) || currentCard(run).id !== cardId || (!override && run.phase !== "drawn") || run.phase === "solved") {
      return { ok: false, message: "That card is not waiting for an answer." };
    }
    const card = currentCard(run);
    if (card.reveal && !identified(run, card)) {
      if (!override && !card.reveal.answers.some(value => normalize(value) === normalize(answer))) return { ok: false, message: "Not quite. Try again." };
      run.identified.push(cardId);
      if (!override) return { ok: true, outcome: "identified", message: "Property identified." };
    }
    if (!override && !card.answers.some(value => normalize(value) === normalize(answer))) {
      return { ok: false, message: "Not quite. Try again." };
    }
    run.phase = "solved";
    run.completed.push(cardId);
    if (override) run.overrides.push(cardId);
    if (card.finishOnSolve) {
      win(run, now);
      return { ok: true, message: "Answer accepted. Your team has reached FINISH!" };
    }
    return { ok: true, message: override ? "Card awarded by the host. You may move one space." : "Answer accepted. You may move one space." };
  }
  function win(run, now) {
    run.remainingMs = remaining(run, now);
    run.finalTimeMs = run.remainingMs;
    run.deadline = null; run.status = "won"; run.phase = "finished";
    run.index = run.config.cards.length;
  }
  function move(run, cardId, now = Date.now()) {
    tick(run, now);
    if (run.status !== "running" || run.phase !== "solved" || currentCard(run).id !== cardId) return false;
    run.index += 1;
    if (run.index === run.config.cards.length) {
      win(run, now);
    } else run.phase = "undrawn";
    return true;
  }
  function continuePlay(run, now = Date.now()) {
    tick(run, now);
    if (run.status !== "running") return false;
    if (run.phase === "solved" && movementMode(run) === "auto") move(run, currentCard(run).id, now);
    if (run.status === "running" && run.phase === "undrawn") draw(run, currentCard(run).id, now);
    return true;
  }
  function answerAndMove(run, cardId, answer, now = Date.now(), override = false) {
    const result = submit(run, cardId, answer, now, override);
    if (!result.ok) return result;
    continuePlay(run, now);
    if (result.outcome === "identified") return result;
    if (movementMode(run) === "manual" && run.status !== "won") return result;
    return { ok: true, message: run.status === "won" ? "Answer accepted. Your team has reached FINISH!" : `${override ? "Card awarded by the host." : "Answer accepted."} Moving one space and turning over the next card.` };
  }
  function pause(run, now = Date.now()) {
    tick(run, now);
    if (run.status !== "running") return false;
    run.remainingMs = remaining(run, now); run.deadline = null; run.status = "paused";
    return true;
  }
  function resume(run, now = Date.now()) {
    if (run.status !== "paused" || run.remainingMs <= 0) return false;
    run.deadline = now + run.remainingMs; run.status = "running";
    return true;
  }
  function adjust(run, minutes, now = Date.now()) {
    check(Number.isFinite(minutes) && minutes !== 0 && Math.abs(minutes) <= 180, "Enter a nonzero adjustment of up to 180 minutes.");
    tick(run, now);
    check(run.status !== "won", "A victory is final. Reset to start a new game.");
    const value = Math.max(0, Math.min(10800000, remaining(run, now) + minutes * 60000));
    run.remainingMs = value;
    if (run.status === "running") run.deadline = now + value;
    else if (value > 0) run.status = "paused";
    if (value === 0) { run.status = "timeout"; run.deadline = null; }
  }
  function showHint(run, cardId, now = Date.now()) {
    tick(run, now);
    if (!["running", "paused"].includes(run.status) || run.phase !== "drawn" || currentCard(run).id !== cardId || !currentCard(run).hint || run.hints.includes(cardId)) return false;
    run.hints.push(cardId);
    return true;
  }
  function validateRun(input) {
    check(input && [1, RUN_VERSION].includes(input.version), "Unsupported saved game version.");
    validateConfig(input.config);
    check(input.config.cards.length > 0 && input.config.cards.every(completeCard), "Saved game has incomplete cards.");
    if (input.version === RUN_VERSION) {
      check(["manual", "auto"].includes(input.movementMode), "Saved movement mode is invalid.");
      check(input.movementMode === (input.config.movementMode || "manual"), "Saved movement mode does not match its pinned setup.");
      check(Array.isArray(input.identified) && new Set(input.identified).size === input.identified.length, "Saved property identification state is invalid.");
    } else check(input.config.cards.every(c => !c.reveal), "Legacy runs cannot contain unidentified new reveal data.");
    check(["running", "paused", "timeout", "won"].includes(input.status), "Saved status is invalid.");
    check(["demo", "live"].includes(input.mode), "Saved play mode is invalid.");
    check(input.mode !== "live" || readiness(input.config).length === 0, "Saved live game contains unconfirmed cards.");
    const count = input.config.cards.length;
    check(Number.isInteger(input.index) && input.index >= 0 && input.index <= count, "Saved card position is invalid.");
    check(["undrawn", "drawn", "solved", "finished"].includes(input.phase), "Saved card phase is invalid.");
    check(Number.isFinite(input.startedAt) && input.startedAt > 0, "Saved start time is invalid.");
    check(Number.isFinite(input.remainingMs) && input.remainingMs >= 0 && input.remainingMs <= 10800000, "Saved remaining time is invalid.");
    check(input.status === "running" ? Number.isFinite(input.deadline) && input.deadline > 0 : input.deadline === null, "Saved deadline is invalid.");
    const expected = input.config.cards.slice(0, input.index + (input.phase === "solved" ? 1 : 0)).map(c => c.id);
    check(Array.isArray(input.completed) && JSON.stringify(expected) === JSON.stringify(input.completed), "Saved completed cards are out of order.");
    if (input.version === RUN_VERSION) {
      check(input.identified.every(id => input.config.cards.some((card, i) => card.id === id && card.reveal && (i < input.index || i === input.index && input.phase !== "undrawn"))), "Saved property identification is ahead of progress or refers to an unknown card.");
      check(input.config.cards.every(card => !card.reveal || !input.completed.includes(card.id) || input.identified.includes(card.id)), "A completed property is missing its identification state.");
    }
    check(Array.isArray(input.overrides) && new Set(input.overrides).size === input.overrides.length && input.overrides.every(id => input.completed.includes(id)), "Saved host overrides are invalid.");
    check(Array.isArray(input.hints) && new Set(input.hints).size === input.hints.length && input.hints.every(id => input.config.cards.slice(0, input.index + (input.phase === "undrawn" ? 0 : 1)).some(c => c.id === id && c.hint)), "Saved hints are invalid.");
    if (input.status === "won") check(input.index === count && input.phase === "finished" && input.finalTimeMs === input.remainingMs, "Saved victory is inconsistent.");
    else check(input.index < count && input.phase !== "finished" && input.finalTimeMs === null, "Saved progress is inconsistent.");
    if (input.status === "timeout") check(input.remainingMs === 0, "Timed-out game has remaining time.");
    if (input.status !== "won") check(input.config.cards.every(c => !c.finishOnSolve || !input.completed.includes(c.id)), "An immediate-finish answer must end the game.");
    return clone(input);
  }
  function boardGeometry(cardCount) {
    check(Number.isInteger(cardCount) && cardCount >= 0 && cardCount <= 24, "Invalid card count.");
    const perSide = Math.max(6, Math.ceil((cardCount + 1) / 4));
    const step = 68 / perSide;
    const space = (left, top, width, height, side) => ({ left, top, width, height, side, x: left + width / 2, y: top + height / 2 });
    const panels = Array.from({ length: perSide * 4 }, (_, slot) => {
      const edge = Math.floor(slot / perSide);
      const i = slot % perSide;
      if (edge === 0) return space(84 - (i + 1) * step, 84, step, 16, "bottom");
      if (edge === 1) return space(0, 84 - (i + 1) * step, 16, step, "left");
      if (edge === 2) return space(16 + i * step, 0, step, 16, "top");
      return space(84, 16 + i * step, 16, step, "right");
    });
    // Unused panel positions are continuous pass-through lanes, never puzzle stops.
    const selected = new Set(Array.from({ length: cardCount + 1 }, (_, i) => cardCount ? Math.round(i * (panels.length - 1) / cardCount) : panels.length - 1));
    return {
      spaces: [space(84, 84, 16, 16, "go"), ...panels.filter((_, i) => selected.has(i))],
      connectors: panels.filter((_, i) => !selected.has(i)),
      corners: [space(0, 84, 16, 16, "bottom-left"), space(0, 0, 16, 16, "top-left"), space(84, 0, 16, 16, "top-right")]
    };
  }
  function boardLayout(cardCount) {
    return boardGeometry(cardCount).spaces;
  }
  function travelPath(layout, from, to) {
    check(layout[from] && layout[to] && to > from, "Pawn movement must travel forward between board spaces.");
    const distance = point => point.y === 92 ? 92 - point.x : point.x === 8 ? 84 + 92 - point.y : point.y === 8 ? 168 + point.x - 8 : 252 + point.y - 8;
    const start = distance(layout[from]);
    const end = distance(layout[to]);
    const corners = [{ x: 8, y: 92 }, { x: 8, y: 8 }, { x: 92, y: 8 }];
    return [layout[from], ...corners.filter(p => distance(p) > start && distance(p) < end), layout[to]]
      .map(p => ({ x: p.x, y: p.y, offset: (distance(p) - start) / (end - start) }));
  }
  return { VERSION, RUN_VERSION, EVENT_REVISION, OLD_EVENT_INTRO, eventUpdateFields, eventUpdateTargets, upgradedEventConfig, applyEventUpdate, SPACE_TYPES, GROUPS, groupChoices, cardStyle, cardView, identified, movementMode, clone, normalize, defaultConfig, eventConfig, validateConfig, readiness, currentCard, remaining, tick, start, draw, submit, move, continuePlay, answerAndMove, pause, resume, adjust, showHint, validateRun, boardGeometry, boardLayout, travelPath };
});
