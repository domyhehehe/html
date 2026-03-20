(() => {
    "use strict";

    // =========================================================
    // 1. 汎用ユーティリティ
    // =========================================================

    function isPlainObject(value) {
      return value !== null && typeof value === "object" && !Array.isArray(value);
    }

    function cloneJson(value) {
      return JSON.parse(JSON.stringify(value));
    }

    function parseJsonSafely(text) {
      try {
        return { ok: true, data: JSON.parse(text) };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }

    function isMeaningfulId(id) {
      return /^[a-z][a-z0-9_-]*$/.test(id);
    }

    function toArrayText(text) {
      if (typeof text === "string") return [text];
      if (Array.isArray(text)) return text.filter((line) => typeof line === "string");
      return [];
    }

    function getNestedValue(target, path) {
      const parts = path.split(".");
      let current = target;

      for (const part of parts) {
        if (current === null || current === undefined || typeof current !== "object" || !(part in current)) {
          return undefined;
        }
        current = current[part];
      }

      return current;
    }

    function ensureNestedParent(target, path) {
      const parts = path.split(".");
      let current = target;

      for (let i = 0; i < parts.length - 1; i += 1) {
        const part = parts[i];
        if (
          current[part] === null ||
          current[part] === undefined ||
          typeof current[part] !== "object" ||
          Array.isArray(current[part])
        ) {
          current[part] = {};
        }
        current = current[part];
      }

      return {
        parent: current,
        key: parts[parts.length - 1]
      };
    }

    function setNestedValue(target, path, value) {
      const ref = ensureNestedParent(target, path);
      ref.parent[ref.key] = value;
    }

    function addNestedNumber(target, path, delta) {
      const current = getNestedValue(target, path);
      const base = typeof current === "number" ? current : 0;
      setNestedValue(target, path, base + delta);
    }

    function addMinutesToTime(timeObj, minutes) {
      if (!isPlainObject(timeObj) || typeof minutes !== "number") return;

      const date = new Date(
        typeof timeObj.year === "number" ? timeObj.year : 2000,
        typeof timeObj.month === "number" ? timeObj.month - 1 : 0,
        typeof timeObj.day === "number" ? timeObj.day : 1,
        typeof timeObj.hour === "number" ? timeObj.hour : 0,
        typeof timeObj.minute === "number" ? timeObj.minute : 0
      );

      date.setMinutes(date.getMinutes() + minutes);

      timeObj.year = date.getFullYear();
      timeObj.month = date.getMonth() + 1;
      timeObj.day = date.getDate();
      timeObj.hour = date.getHours();
      timeObj.minute = date.getMinutes();
      timeObj.turn = typeof timeObj.turn === "number" ? timeObj.turn + 1 : 1;
    }

    function formatTime(timeObj) {
      if (!isPlainObject(timeObj)) return "-";

      const pad = (n) => String(n).padStart(2, "0");
      const hasFullDate =
        ["year", "month", "day", "hour", "minute"].every((key) => typeof timeObj[key] === "number");

      if (!hasFullDate) return "-";

      return `${timeObj.year}/${pad(timeObj.month)}/${pad(timeObj.day)} ${pad(timeObj.hour)}:${pad(timeObj.minute)} (T${typeof timeObj.turn === "number" ? timeObj.turn : 0})`;
    }

    async function copyTextToClipboard(text) {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return;
      }

      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";

      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();

      const ok = document.execCommand("copy");
      document.body.removeChild(textarea);

      if (!ok) {
        throw new Error("この環境ではクリップボードへのコピーが許可されていません。");
      }
    }

    async function readTextFromClipboard() {
      if (navigator.clipboard && window.isSecureContext) {
        return navigator.clipboard.readText();
      }
      throw new Error("この環境ではクリップボードの読み取りが許可されていません。");
    }

    // =========================================================
    // 2. 定数・UI参照・静的データ
    // =========================================================

    const MESSAGE_WINDOW_LIMIT = 3;

    const ui = {
      setup: {
        promptModeSelect: document.getElementById("promptModeSelect"),
        sampleSelect: document.getElementById("sampleSelect"),
        scriptInput: document.getElementById("scriptInput"),
        jsonFileInput: document.getElementById("jsonFileInput"),
        openFileButton: document.getElementById("openFileButton"),
        loadExampleButton: document.getElementById("loadExampleButton"),
        copyPromptButton: document.getElementById("copyPromptButton"),
        pasteScriptButton: document.getElementById("pasteScriptButton"),
        loadScriptButton: document.getElementById("loadScriptButton"),
        restartButton: document.getElementById("restartButton"),
        copyStateButton: document.getElementById("copyStateButton"),
        copyStatusButton: document.getElementById("copyStatusButton"),
        copyContinuationButton: document.getElementById("copyContinuationButton")
      },
      stateTools: {
        toggleRawStateButton: document.getElementById("toggleRawStateButton"),
        rawStateArea: document.getElementById("rawStateArea")
      },
      status: {
        globalStatus: document.getElementById("globalStatus")
      },
      header: {
        gameTitle: document.getElementById("gameTitle"),
        currentEventIdText: document.getElementById("currentEventIdText"),
        currentSpotIdText: document.getElementById("currentSpotIdText"),
        currentTimeText: document.getElementById("currentTimeText"),
        stepText: document.getElementById("stepText"),
        healthText: document.getElementById("healthText")
      },
      state: {
        itemsText: document.getElementById("itemsText"),
        statePreview: document.getElementById("statePreview")
      },
      event: {
        eventTitle: document.getElementById("eventTitle"),
        speakerLine: document.getElementById("speakerLine"),
        textArea: document.getElementById("textArea"),
        choiceList: document.getElementById("choiceList")
      },
      log: {
        logList: document.getElementById("logList")
      }
    };

    const game = {
      loadedSource: null,
      runtime: null,
      state: null,
      currentEventId: "",
      stepCount: 0,
      logEntries: [],
      messageHistory: [],
      isRawStateVisible: false
    };

    const SAMPLE_SCENARIO = window.HOLMES_SAMPLE_SCENARIO || {};
    const SAMPLE_REGISTRY = Array.isArray(window.HOLMES_SAMPLE_REGISTRY) ? window.HOLMES_SAMPLE_REGISTRY : [];
    const PROMPT_SAMPLE_JSON = window.HOLMES_PROMPT_SAMPLE_JSON || JSON.stringify(SAMPLE_SCENARIO, null, 2);
    const GENERIC_PROMPT = window.HOLMES_PROMPTS?.generic || '';
    const SHINDO_PROMPT = window.HOLMES_PROMPTS?.shindo || '';

    function normalizeScriptStructure(source) {
      if (!isPlainObject(source)) return source;

      const data = cloneJson(source);

      if (!isPlainObject(data.initial_state)) {
        data.initial_state = {};
      }

      if (!isPlainObject(data.scenarios)) {
        data.scenarios = {};
      }

      if (!isPlainObject(data.quests)) {
        data.quests = {};
      }

      const activeScenarioId =
        typeof data.initial_state.active_scenario_id === "string" && data.initial_state.active_scenario_id.trim()
          ? data.initial_state.active_scenario_id.trim()
          : "";

      if (isPlainObject(data.scenario)) {
        const legacyScenarioId = activeScenarioId || "main_scenario";
        if (!isPlainObject(data.scenarios[legacyScenarioId])) {
          data.scenarios[legacyScenarioId] = cloneJson(data.scenario);
        }
        delete data.scenario;

        if (!activeScenarioId) {
          data.initial_state.active_scenario_id = legacyScenarioId;
        }
      }

      Object.entries(data.scenarios).forEach(([scenarioId, scenarioDef]) => {
        if (!isPlainObject(scenarioDef) || !isPlainObject(scenarioDef.quests)) return;

        Object.entries(scenarioDef.quests).forEach(([questId, questDef]) => {
          if (!isPlainObject(questDef)) return;

          if (!isPlainObject(data.quests[questId])) {
            data.quests[questId] = cloneJson(questDef);
          }

          if (!Array.isArray(data.quests[questId].related_scenario_ids)) {
            data.quests[questId].related_scenario_ids = [];
          }

          if (!data.quests[questId].related_scenario_ids.includes(scenarioId)) {
            data.quests[questId].related_scenario_ids.push(scenarioId);
          }
        });

        delete scenarioDef.quests;
      });

      if (!Array.isArray(data.initial_state.active_quest_ids)) {
        data.initial_state.active_quest_ids = [];
      }

      if (
        typeof data.initial_state.current_quest_id === "string" &&
        data.initial_state.current_quest_id.trim() &&
        !data.initial_state.active_quest_ids.includes(data.initial_state.current_quest_id.trim())
      ) {
        data.initial_state.active_quest_ids.push(data.initial_state.current_quest_id.trim());
      }

      data.initial_state.active_quest_ids = data.initial_state.active_quest_ids
        .filter((questId) => typeof questId === "string" && questId.trim())
        .map((questId) => questId.trim())
        .filter((questId, index, array) => array.indexOf(questId) === index);

      if (
        typeof data.initial_state.primary_quest_id !== "string" ||
        !data.initial_state.primary_quest_id.trim()
      ) {
        data.initial_state.primary_quest_id = data.initial_state.active_quest_ids[0] || "";
      } else {
        data.initial_state.primary_quest_id = data.initial_state.primary_quest_id.trim();
      }

      if (
        data.initial_state.primary_quest_id &&
        !data.initial_state.active_quest_ids.includes(data.initial_state.primary_quest_id)
      ) {
        data.initial_state.active_quest_ids.unshift(data.initial_state.primary_quest_id);
      }

      if (!isPlainObject(data.initial_state.quest_states)) {
        data.initial_state.quest_states = {};
      }

      data.initial_state.active_quest_ids.forEach((questId) => {
        if (!isPlainObject(data.initial_state.quest_states[questId])) {
          data.initial_state.quest_states[questId] = {
            status: "active",
            progress_flags: [],
            completed_at: null
          };
          return;
        }

        if (typeof data.initial_state.quest_states[questId].status !== "string") {
          data.initial_state.quest_states[questId].status = "active";
        }
        if (!Array.isArray(data.initial_state.quest_states[questId].progress_flags)) {
          data.initial_state.quest_states[questId].progress_flags = [];
        }
        if (!("completed_at" in data.initial_state.quest_states[questId])) {
          data.initial_state.quest_states[questId].completed_at = null;
        }
      });

      if (
        typeof data.initial_state.current_quest_id !== "string" ||
        !data.initial_state.current_quest_id.trim()
      ) {
        data.initial_state.current_quest_id = data.initial_state.primary_quest_id || "";
      }

      if (typeof data.initial_state.active_scenario_id !== "string") {
        data.initial_state.active_scenario_id = "";
      }

      return data;
    }

    // =========================================================
    // 3. ゲーム状態の読み取り
    // =========================================================

    function ensureStateCollections() {
      if (!isPlainObject(game.state)) game.state = {};
      if (!Array.isArray(game.state.flags)) game.state.flags = [];
      if (!isPlainObject(game.state.unique)) game.state.unique = {};
      if (!isPlainObject(game.state.characters)) game.state.characters = {};
      if (!isPlainObject(game.state.spot_states)) game.state.spot_states = {};
      if (!Array.isArray(game.state.active_quest_ids)) game.state.active_quest_ids = [];
      if (!isPlainObject(game.state.quest_states)) game.state.quest_states = {};
      if (typeof game.state.active_scenario_id !== "string") game.state.active_scenario_id = "";

      game.state.active_quest_ids = game.state.active_quest_ids
        .filter((questId) => typeof questId === "string" && questId.trim())
        .map((questId) => questId.trim())
        .filter((questId, index, array) => array.indexOf(questId) === index);

      const fallbackQuestId =
        typeof game.state.current_quest_id === "string" && game.state.current_quest_id.trim()
          ? game.state.current_quest_id.trim()
          : "";

      if (
        typeof game.state.primary_quest_id !== "string" ||
        !game.state.primary_quest_id.trim()
      ) {
        game.state.primary_quest_id = game.state.active_quest_ids[0] || fallbackQuestId || "";
      }

      if (game.state.primary_quest_id && !game.state.active_quest_ids.includes(game.state.primary_quest_id)) {
        game.state.active_quest_ids.unshift(game.state.primary_quest_id);
      }

      game.state.current_quest_id = game.state.primary_quest_id || "";

      game.state.active_quest_ids.forEach((questId) => {
        if (!isPlainObject(game.state.quest_states[questId])) {
          game.state.quest_states[questId] = {
            status: "active",
            progress_flags: [],
            completed_at: null
          };
          return;
        }

        if (typeof game.state.quest_states[questId].status !== "string") {
          game.state.quest_states[questId].status = "active";
        }
        if (!Array.isArray(game.state.quest_states[questId].progress_flags)) {
          game.state.quest_states[questId].progress_flags = [];
        }
        if (!("completed_at" in game.state.quest_states[questId])) {
          game.state.quest_states[questId].completed_at = null;
        }
      });
    }

    function getScenarioDefinitions() {
      return isPlainObject(game.runtime?.scenarios) ? game.runtime.scenarios : {};
    }

    function getQuestDefinitions() {
      return isPlainObject(game.runtime?.quests) ? game.runtime.quests : {};
    }

    function getActiveScenarioId() {
      return typeof game.state?.active_scenario_id === "string" ? game.state.active_scenario_id : "";
    }

    function getActiveScenario() {
      const activeScenarioId = getActiveScenarioId();
      if (!activeScenarioId) return null;

      const scenarios = getScenarioDefinitions();
      return isPlainObject(scenarios[activeScenarioId]) ? scenarios[activeScenarioId] : null;
    }

    function getRuntimeAreaDefinitions() {
      const merged = isPlainObject(game.runtime?.world?.areas) ? cloneJson(game.runtime.world.areas) : {};
      const activeScenario = getActiveScenario();

      if (isPlainObject(activeScenario?.overlay?.add_areas)) {
        Object.entries(activeScenario.overlay.add_areas).forEach(([areaId, areaDef]) => {
          if (isPlainObject(areaDef)) {
            merged[areaId] = cloneJson(areaDef);
          }
        });
      }

      return merged;
    }

    function getRuntimeDungeonDefinitions() {
      const merged = isPlainObject(game.runtime?.world?.dungeons) ? cloneJson(game.runtime.world.dungeons) : {};
      const activeScenario = getActiveScenario();

      if (isPlainObject(activeScenario?.overlay?.add_dungeons)) {
        Object.entries(activeScenario.overlay.add_dungeons).forEach(([dungeonId, dungeonDef]) => {
          if (isPlainObject(dungeonDef)) {
            merged[dungeonId] = cloneJson(dungeonDef);
          }
        });
      }

      return merged;
    }

    function getRuntimeSpotDefinitions() {
      const merged = isPlainObject(game.runtime?.world?.spots) ? cloneJson(game.runtime.world.spots) : {};
      const activeScenario = getActiveScenario();

      if (isPlainObject(activeScenario?.overlay?.add_spots)) {
        Object.entries(activeScenario.overlay.add_spots).forEach(([spotId, spotDef]) => {
          if (isPlainObject(spotDef)) {
            merged[spotId] = cloneJson(spotDef);
          }
        });
      }

      if (Array.isArray(activeScenario?.overlay?.disabled_spot_ids)) {
        activeScenario.overlay.disabled_spot_ids.forEach((spotId) => {
          delete merged[spotId];
        });
      }

      return merged;
    }

    function getRuntimeCharacterDefinitions() {
      const merged = isPlainObject(game.runtime?.definitions?.characters) ? cloneJson(game.runtime.definitions.characters) : {};
      const activeScenario = getActiveScenario();

      if (isPlainObject(activeScenario?.overlay?.add_characters)) {
        Object.entries(activeScenario.overlay.add_characters).forEach(([characterId, characterDef]) => {
          if (isPlainObject(characterDef)) {
            merged[characterId] = cloneJson(characterDef);
          }
        });
      }

      return merged;
    }

    function getRuntimeItemDefinitions() {
      const merged = isPlainObject(game.runtime?.definitions?.items) ? cloneJson(game.runtime.definitions.items) : {};
      const activeScenario = getActiveScenario();

      if (isPlainObject(activeScenario?.overlay?.add_items)) {
        Object.entries(activeScenario.overlay.add_items).forEach(([itemId, itemDef]) => {
          if (isPlainObject(itemDef)) {
            merged[itemId] = cloneJson(itemDef);
          }
        });
      }

      return merged;
    }

    function getPrimaryQuestId() {
      if (typeof game.state?.primary_quest_id === "string" && game.state.primary_quest_id.trim()) {
        return game.state.primary_quest_id.trim();
      }

      if (typeof game.state?.current_quest_id === "string" && game.state.current_quest_id.trim()) {
        return game.state.current_quest_id.trim();
      }

      return Array.isArray(game.state?.active_quest_ids) && game.state.active_quest_ids.length > 0
        ? game.state.active_quest_ids[0]
        : "";
    }

    function getQuestById(questId) {
      if (typeof questId !== "string" || !questId.trim()) return null;
      const quests = getQuestDefinitions();
      return isPlainObject(quests[questId]) ? quests[questId] : null;
    }

    function getPlayerCharacterId() {
      return typeof game.state?.player_character_id === "string" ? game.state.player_character_id : "";
    }

    function getPlayerCharacter() {
      const playerCharacterId = getPlayerCharacterId();
      if (!playerCharacterId) return null;
      if (!isPlainObject(game.state?.characters?.[playerCharacterId])) return null;
      return game.state.characters[playerCharacterId];
    }

    function getCharacterById(characterId) {
      if (typeof characterId !== "string") return null;
      if (!isPlainObject(game.state?.characters?.[characterId])) return null;
      return game.state.characters[characterId];
    }

    function getCharacterSpotId(characterId) {
      const character = getCharacterById(characterId);
      return typeof character?.spot_id === "string" ? character.spot_id : "";
    }

    function getPlayerInventory() {
      const playerCharacter = getPlayerCharacter();
      if (!playerCharacter) return [];

      if (!Array.isArray(playerCharacter.inventory)) {
        playerCharacter.inventory = [];
      }
      return playerCharacter.inventory;
    }

    function getInventoryQuantity(itemId) {
      if (typeof itemId !== "string" || !itemId.trim()) return 0;

      let total = 0;
      getPlayerInventory().forEach((entry) => {
        if (typeof entry === "string") {
          if (entry === itemId) total += 1;
          return;
        }

        if (isPlainObject(entry) && entry.item_id === itemId) {
          total += typeof entry.quantity === "number" ? entry.quantity : 1;
        }
      });

      return total;
    }

    function inventoryHasItem(itemId, quantity) {
      const requiredQuantity = typeof quantity === "number" && quantity > 0 ? quantity : 1;
      return getInventoryQuantity(itemId) >= requiredQuantity;
    }

    function getHealthValue() {
      const playerCharacter = getPlayerCharacter();
      const currentStats = isPlainObject(playerCharacter?.current_stats) ? playerCharacter.current_stats : null;
      if (!currentStats) return null;

      for (const key of ["体力", "hp", "health"]) {
        if (typeof currentStats[key] === "number") {
          return currentStats[key];
        }
      }

      return null;
    }

    function getActiveEventById(eventId) {
      if (typeof eventId !== "string" || !eventId.trim()) return null;

      const activeScenario = getActiveScenario();
      if (isPlainObject(activeScenario?.events) && isPlainObject(activeScenario.events[eventId])) {
        return activeScenario.events[eventId];
      }

      if (isPlainObject(game.runtime?.world?.base_events) && isPlainObject(game.runtime.world.base_events[eventId])) {
        return game.runtime.world.base_events[eventId];
      }

      return null;
    }

    function findFirstVisibleEventId(spotId = "") {
      const currentSpotId = spotId || getCharacterSpotId(getPlayerCharacterId());
      if (!currentSpotId) return "";

      const activeScenario = getActiveScenario();
      const eventRules = activeScenario?.event_rules;
      const mode = activeScenario ? (eventRules?.mode || "scenario_only") : "base_only";

      const baseEventIds = isPlainObject(game.runtime?.world?.base_events)
        ? Object.entries(game.runtime.world.base_events)
          .filter(([, eventDef]) => isPlainObject(eventDef) && eventDef.spot_id === currentSpotId)
          .map(([eventId]) => eventId)
        : [];
      const scenarioEventIds = isPlainObject(activeScenario?.events)
        ? Object.entries(activeScenario.events)
          .filter(([, eventDef]) => isPlainObject(eventDef) && eventDef.spot_id === currentSpotId)
          .map(([eventId]) => eventId)
        : [];

      if (mode === "base_only") return baseEventIds[0] || "";
      if (mode === "scenario_only") return scenarioEventIds[0] || "";
      if (mode === "merge") return [...scenarioEventIds, ...baseEventIds][0] || "";
      if (mode === "disable_all") return "";

      return scenarioEventIds[0] || baseEventIds[0] || "";
    }

    function resolveVisibleEvents(spotId = "") {
      const currentSpotId = spotId || getCharacterSpotId(getPlayerCharacterId());
      if (!currentSpotId) return [];

      const activeScenario = getActiveScenario();
      const eventRules = activeScenario?.event_rules;
      const mode = activeScenario ? (eventRules?.mode || "scenario_only") : "base_only";

      const baseEvents = [];
      const scenarioEvents = [];

      // base_eventsから収集
      if (isPlainObject(game.runtime?.world?.base_events)) {
        Object.values(game.runtime.world.base_events).forEach((event) => {
          if (event.spot_id === currentSpotId) {
            baseEvents.push(event);
          }
        });
      }

      // scenario.eventsから収集
      if (isPlainObject(activeScenario?.events)) {
        Object.values(activeScenario.events).forEach((event) => {
          if (event.spot_id === currentSpotId) {
            scenarioEvents.push(event);
          }
        });
      }

      // modeに応じて合成
      if (mode === "base_only") {
        return baseEvents;
      } else if (mode === "scenario_only") {
        return scenarioEvents;
      } else if (mode === "merge") {
        return [...scenarioEvents, ...baseEvents];
      } else if (mode === "disable_all") {
        return [];
      }

      return scenarioEvents; // default
    }

    function getCurrentEvent() {
      const currentSpotId = getCharacterSpotId(getPlayerCharacterId());
      const currentEventId = typeof game.currentEventId === "string" ? game.currentEventId.trim() : "";
      const currentEvent = getActiveEventById(currentEventId);

      if (currentEvent && currentEvent.spot_id === currentSpotId) {
        return currentEvent;
      }

      const visibleEvents = resolveVisibleEvents(currentSpotId);
      return visibleEvents.length > 0 ? visibleEvents[0] : null;
    }

    function resolveSpotById(spotId) {
      const spots = getRuntimeSpotDefinitions();
      return isPlainObject(spots[spotId]) ? spots[spotId] : null;
    }

    function resolveAreaById(areaId) {
      const areas = getRuntimeAreaDefinitions();
      return isPlainObject(areas[areaId]) ? areas[areaId] : null;
    }

    function resolveDungeonById(dungeonId) {
      const dungeons = getRuntimeDungeonDefinitions();
      return isPlainObject(dungeons[dungeonId]) ? dungeons[dungeonId] : null;
    }

    function resolveItemById(itemId) {
      if (typeof itemId !== "string" || !itemId.trim()) return null;
      const items = getRuntimeItemDefinitions();
      return isPlainObject(items[itemId]) ? items[itemId] : null;
    }

    function resolveCharacterDefinitionById(characterId) {
      if (typeof characterId !== "string" || !characterId.trim()) return null;
      const characters = getRuntimeCharacterDefinitions();
      return isPlainObject(characters[characterId]) ? characters[characterId] : null;
    }

    function getSpotById(spotId) {
      return resolveSpotById(spotId);
    }

    function getDisplaySpotName(spotId) {
      const spot = getSpotById(spotId);
      return spot && typeof spot.name === "string" ? spot.name : (spotId || "-");
    }

    function getOptionTargetSpotId(option) {
      if (!isPlainObject(option)) return "";

      if (typeof option.target_spot_id === "string" && option.target_spot_id.trim()) {
        return option.target_spot_id.trim();
      }

      const playerCharacterId = getPlayerCharacterId();
      if (playerCharacterId) {
        const playerSpotPath = `characters.${playerCharacterId}.spot_id`;
        const playerSpotValue = getNestedValue(option.effects, `set.${playerSpotPath}`);
        if (typeof playerSpotValue === "string" && playerSpotValue.trim()) {
          return playerSpotValue.trim();
        }
      }

      const currentSpotValue = getNestedValue(option.effects, "set.current_spot_id");
      if (typeof currentSpotValue === "string" && currentSpotValue.trim()) {
        return currentSpotValue.trim();
      }

      return "";
    }

    function getDisplayItemNames() {
      const names = [];

      getPlayerInventory().forEach((entry) => {
        const itemId = typeof entry === "string" ? entry : (isPlainObject(entry) ? entry.item_id : null);
        const quantity = typeof entry === "string"
          ? 1
          : (isPlainObject(entry) && typeof entry.quantity === "number" ? entry.quantity : 1);

        if (itemId) {
          const item = resolveItemById(itemId);
          const name = item && typeof item.name === "string" ? item.name : itemId;
          names.push(quantity > 1 ? `${name}(${quantity})` : name);
        }
      });

      return names;
    }

    function getCurrentSpotItemsText() {
      const currentSpotId = typeof game.state?.current_spot_id === "string" ? game.state.current_spot_id : "";
      const currentSpotState = isPlainObject(game.state?.spot_states?.[currentSpotId])
        ? game.state.spot_states[currentSpotId]
        : null;

      if (!currentSpotState || !Array.isArray(currentSpotState.items) || currentSpotState.items.length === 0) {
        return "なし";
      }

      return currentSpotState.items.map((entry) => {
        const itemId = entry.item_id;
        const quantity = typeof entry.quantity === "number" ? entry.quantity : 1;
        const itemDefinition = resolveItemById(itemId);
        const label = itemDefinition && typeof itemDefinition.name === "string"
          ? itemDefinition.name
          : itemId;
        return `${label} x${quantity}`;
      }).join(" / ");
    }

    function buildNpcSummaryLines() {
      const lines = [];
      const playerCharacterId = getPlayerCharacterId();

      Object.entries(game.state?.characters || {}).forEach(([characterId, character]) => {
        if (characterId === playerCharacterId || !isPlainObject(character)) return;

        const name = resolveCharacterDefinitionById(characterId)?.name || characterId;
        const spotId = typeof character.spot_id === "string" ? character.spot_id : "";
        const status = typeof character.status === "string" ? character.status : "-";

        lines.push(`${name}: ${getDisplaySpotName(spotId)} / ${status}`);
      });

      return lines;
    }

    function buildStateSummary() {
      if (!isPlainObject(game.state)) {
        return "状態データなし";
      }

      const lines = [];
      const playerCharacterId = getPlayerCharacterId();
      const playerCharacter = getPlayerCharacter();
      const primaryQuestId = getPrimaryQuestId();
      const primaryQuest = getQuestById(primaryQuestId);
      const activeScenarioId = getActiveScenarioId();
      const activeScenario = getActiveScenario();
      const currentSpotId = getCharacterSpotId(playerCharacterId);
      const currentEventId = typeof game.state.current_event_id === "string" ? game.state.current_event_id : "";

      if (playerCharacterId) {
        const playerName = resolveCharacterDefinitionById(playerCharacterId)?.name || playerCharacterId;
        lines.push(`プレイヤー: ${playerName}`);
      }

      if (activeScenario) {
        lines.push(`シナリオ: ${activeScenario.title || activeScenarioId}`);
      } else if (activeScenarioId) {
        lines.push(`シナリオID: ${activeScenarioId}`);
      } else {
        lines.push("シナリオ: なし");
      }

      if (primaryQuest) {
        lines.push(`主クエスト: ${primaryQuest.title}`);
      } else if (primaryQuestId) {
        lines.push(`主クエストID: ${primaryQuestId}`);
      }

      if (Array.isArray(game.state.active_quest_ids) && game.state.active_quest_ids.length > 0) {
        lines.push(`進行中クエスト: ${game.state.active_quest_ids.join(" / ")}`);
      }

      if (currentSpotId) {
        lines.push(`現在地: ${getDisplaySpotName(currentSpotId)}`);
      }

      if (currentEventId) {
        lines.push(`現在イベントID: ${currentEventId}`);
      }

      if (playerCharacter && isPlainObject(playerCharacter.current_stats)) {
        const statEntries = Object.entries(playerCharacter.current_stats)
          .filter(([, value]) => typeof value === "number")
          .map(([key, value]) => `${key}: ${value}`);

        if (statEntries.length > 0) {
          lines.push(`ステータス: ${statEntries.join(" / ")}`);
        }
      }

      if (isPlainObject(game.state.unique) && Object.keys(game.state.unique).length > 0) {
        const uniqueEntries = Object.entries(game.state.unique).map(([key, value]) => `${key}: ${value}`);
        lines.push(`固有値: ${uniqueEntries.join(" / ")}`);
      }

      if (Array.isArray(game.state.flags) && game.state.flags.length > 0) {
        lines.push(`フラグ: ${game.state.flags.join(" / ")}`);
      } else {
        lines.push("フラグ: なし");
      }

      const npcSummaryLines = buildNpcSummaryLines();
      if (npcSummaryLines.length > 0) {
        lines.push("NPC位置:");
        npcSummaryLines.forEach((line) => lines.push(`- ${line}`));
      }

      lines.push(`この場所の残アイテム: ${getCurrentSpotItemsText()}`);

      return lines.join("\n");
    }

    function getVisibleEventTextLines(eventDef) {
      const lines = [];
      toArrayText(eventDef.text).forEach((line) => lines.push(line));

      if (Array.isArray(eventDef.conditional_texts)) {
        eventDef.conditional_texts.forEach((entry) => {
          if (!isPlainObject(entry)) return;
          if (!checkConditions(entry.conditions)) return;
          toArrayText(entry.text).forEach((line) => lines.push(line));
        });
      }

      return lines;
    }

    // =========================================================
    // 4. ゲーム状態の更新
    // =========================================================

    function setGlobalStatus(type, message) {
      ui.status.globalStatus.className = `status ${type}`;
      ui.status.globalStatus.textContent = message;
    }

    function addLogEntry(line) {
      game.logEntries.push(line);
      renderLogPanel();
    }

    function appendMessageLine(line) {
      if (typeof line !== "string") return;
      const trimmed = line.trim();
      if (!trimmed) return;
      game.messageHistory.push(trimmed);
    }

    function setCurrentEventId(eventId) {
      game.currentEventId = eventId;
      if (isPlainObject(game.state)) {
        game.state.current_event_id = eventId;
      }
    }

    function setCurrentSpot(spotId) {
      if (!isPlainObject(game.state)) return;
      game.state.current_spot_id = spotId;
    }

    function moveCharacterToSpot(characterId, spotId) {
      const character = getCharacterById(characterId);
      if (!character) return;
      character.spot_id = spotId;
      if (characterId === getPlayerCharacterId()) {
        setCurrentSpot(spotId);
      }
    }

    function syncPlayerSpotToCurrentSpot() {
      const playerCharacterId = getPlayerCharacterId();
      const currentSpotId = typeof game.state?.current_spot_id === "string" ? game.state.current_spot_id : "";
      if (!playerCharacterId || !currentSpotId) return;
      moveCharacterToSpot(playerCharacterId, currentSpotId);
    }

    function addFlag(flag) {
      if (typeof flag !== "string" || !flag.trim()) return;
      ensureStateCollections();
      if (!game.state.flags.includes(flag)) {
        game.state.flags.push(flag);
      }
    }

    function hasFlag(flag) {
      if (typeof flag !== "string" || !flag.trim()) return false;
      ensureStateCollections();
      return game.state.flags.includes(flag);
    }

    function removeFlags(flags) {
      if (!Array.isArray(flags) || flags.length === 0) return;
      ensureStateCollections();
      game.state.flags = game.state.flags.filter((flag) => !flags.includes(flag));
    }

    function addUniqueValue(key, delta) {
      if (typeof key !== "string" || typeof delta !== "number") return;
      ensureStateCollections();
      game.state.unique[key] = (typeof game.state.unique[key] === "number" ? game.state.unique[key] : 0) + delta;
    }

    function advanceGameTime(minutes) {
      if (!isPlainObject(game.state?.time)) return;
      if (typeof minutes !== "number") return;
      addMinutesToTime(game.state.time, minutes);
    }

    function addItemToInventory(itemId, quantity) {
      const inventory = getPlayerInventory();
      const amount = typeof quantity === "number" && quantity > 0 ? quantity : 1;
      const existingEntry = inventory.find((entry) => isPlainObject(entry) && entry.item_id === itemId);

      if (existingEntry) {
        existingEntry.quantity = (typeof existingEntry.quantity === "number" ? existingEntry.quantity : 1) + amount;
        return;
      }

      inventory.push({ item_id: itemId, quantity: amount });
    }

    function removeItemFromInventory(itemId, quantity) {
      const inventory = getPlayerInventory();
      let remaining = typeof quantity === "number" && quantity > 0 ? quantity : 1;

      for (let i = inventory.length - 1; i >= 0 && remaining > 0; i -= 1) {
        const entry = inventory[i];

        if (typeof entry === "string" && entry === itemId) {
          inventory.splice(i, 1);
          remaining -= 1;
          continue;
        }

        if (isPlainObject(entry) && entry.item_id === itemId) {
          const currentQuantity = typeof entry.quantity === "number" ? entry.quantity : 1;
          if (currentQuantity <= remaining) {
            remaining -= currentQuantity;
            inventory.splice(i, 1);
          } else {
            entry.quantity = currentQuantity - remaining;
            remaining = 0;
          }
        }
      }
    }

    function getOrCreateSpotState(spotId) {
      ensureStateCollections();
      if (!isPlainObject(game.state.spot_states[spotId])) {
        game.state.spot_states[spotId] = { items: [] };
      }
      if (!Array.isArray(game.state.spot_states[spotId].items)) {
        game.state.spot_states[spotId].items = [];
      }
      return game.state.spot_states[spotId];
    }

    function removeItemFromSpotState(spotId, itemId, quantity) {
      if (!spotId || !itemId) return;

      const spotState = getOrCreateSpotState(spotId);
      const items = spotState.items;
      let remaining = typeof quantity === "number" && quantity > 0 ? quantity : 1;

      for (let i = items.length - 1; i >= 0 && remaining > 0; i -= 1) {
        const entry = items[i];
        if (!isPlainObject(entry) || entry.item_id !== itemId) continue;

        const currentQuantity = typeof entry.quantity === "number" ? entry.quantity : 1;
        if (currentQuantity <= remaining) {
          remaining -= currentQuantity;
          items.splice(i, 1);
        } else {
          entry.quantity = currentQuantity - remaining;
          remaining = 0;
        }
      }
    }

    // =========================================================
    // 5. 条件判定
    // =========================================================

    function characterSpotConditionMet(characterSpotMap, mode) {
      if (!isPlainObject(characterSpotMap)) return true;

      for (const [characterId, allowedSpotIds] of Object.entries(characterSpotMap)) {
        const currentSpotId = getCharacterSpotId(characterId);
        const normalizedSpotIds = Array.isArray(allowedSpotIds)
          ? allowedSpotIds.filter((spotId) => typeof spotId === "string")
          : [];

        if (normalizedSpotIds.length === 0) return false;

        const matched = normalizedSpotIds.includes(currentSpotId);

        if (mode === "required" && !matched) return false;
        if (mode === "forbidden" && matched) return false;
      }

      return true;
    }

    function checkFlagConditions(conditions) {
      if (Array.isArray(conditions.required_flags) && conditions.required_flags.some((flag) => !game.state.flags.includes(flag))) {
        return false;
      }

      if (Array.isArray(conditions.forbidden_flags) && conditions.forbidden_flags.some((flag) => game.state.flags.includes(flag))) {
        return false;
      }

      return true;
    }

    function checkCharacterSpotConditions(conditions) {
      if (!characterSpotConditionMet(conditions.required_character_spots, "required")) {
        return false;
      }

      if (!characterSpotConditionMet(conditions.forbidden_character_spots, "forbidden")) {
        return false;
      }

      return true;
    }

    function checkInventoryConditions(conditions) {
      if (!Array.isArray(conditions.required_items)) return true;

      for (const item of conditions.required_items) {
        if (typeof item === "string") {
          if (!inventoryHasItem(item, 1)) return false;
          continue;
        }

        if (isPlainObject(item) && typeof item.item_id === "string") {
          if (!inventoryHasItem(item.item_id, item.quantity)) return false;
          continue;
        }

        return false;
      }

      return true;
    }

    function checkStateNumberConditions(conditions) {
      if (isPlainObject(conditions.min)) {
        for (const [path, min] of Object.entries(conditions.min)) {
          const value = getNestedValue(game.state, path);
          if (typeof value !== "number" || value < min) return false;
        }
      }

      if (isPlainObject(conditions.max)) {
        for (const [path, max] of Object.entries(conditions.max)) {
          const value = getNestedValue(game.state, path);
          if (typeof value !== "number" || value > max) return false;
        }
      }

      return true;
    }

    function checkUniqueValueConditions(conditions) {
      if (isPlainObject(conditions.min_unique)) {
        for (const [key, min] of Object.entries(conditions.min_unique)) {
          const value = game.state.unique[key];
          if (typeof value !== "number" || value < min) return false;
        }
      }

      if (isPlainObject(conditions.max_unique)) {
        for (const [key, max] of Object.entries(conditions.max_unique)) {
          const value = game.state.unique[key];
          if (typeof value !== "number" || value > max) return false;
        }
      }

      return true;
    }

    function checkConditions(conditions) {
      if (!isPlainObject(conditions)) return true;
      ensureStateCollections();

      // 1. フラグ条件
      if (!checkFlagConditions(conditions)) return false;

      // 2. NPC位置条件
      if (!checkCharacterSpotConditions(conditions)) return false;

      // 3. 所持アイテム条件
      if (!checkInventoryConditions(conditions)) return false;

      // 4. state 数値条件
      if (!checkStateNumberConditions(conditions)) return false;

      // 5. unique 数値条件
      if (!checkUniqueValueConditions(conditions)) return false;

      return true;
    }

    // =========================================================
    // 6. effects 適用
    // =========================================================

    function applyNumericAddEffects(effects) {
      if (!isPlainObject(effects.add)) return;

      Object.entries(effects.add).forEach(([path, delta]) => {
        if (typeof delta !== "number") return;
        addNestedNumber(game.state, path, delta);
      });
    }

    function applySetEffects(effects) {
      if (!isPlainObject(effects.set)) return;

      Object.entries(effects.set).forEach(([path, value]) => {
        setNestedValue(game.state, path, value);
      });
    }

    function applyFlagEffects(effects) {
      if (Array.isArray(effects.set_flags)) {
        effects.set_flags.forEach((flag) => addFlag(flag));
      }

      if (Array.isArray(effects.remove_flags)) {
        removeFlags(effects.remove_flags);
      }
    }

    function applyUniqueValueEffects(effects) {
      if (!isPlainObject(effects.add_unique)) return;

      Object.entries(effects.add_unique).forEach(([key, delta]) => {
        if (typeof delta !== "number") return;
        addUniqueValue(key, delta);
      });
    }

    function applyInventoryEffects(effects) {
      if (Array.isArray(effects.add_items)) {
        effects.add_items.forEach((entry) => {
          if (typeof entry === "string") {
            addItemToInventory(entry, 1);
            return;
          }
          if (isPlainObject(entry) && typeof entry.item_id === "string") {
            addItemToInventory(entry.item_id, entry.quantity);
          }
        });
      }

      if (Array.isArray(effects.remove_items)) {
        effects.remove_items.forEach((entry) => {
          if (typeof entry === "string") {
            removeItemFromInventory(entry, 1);
            return;
          }
          if (isPlainObject(entry) && typeof entry.item_id === "string") {
            removeItemFromInventory(entry.item_id, entry.quantity);
          }
        });
      }
    }

    function applySpotItemEffects(effects) {
      if (!Array.isArray(effects.remove_spot_items)) return;

      effects.remove_spot_items.forEach((entry) => {
        const spotId = isPlainObject(entry) && typeof entry.spot_id === "string"
          ? entry.spot_id
          : game.state.current_spot_id;
        const itemId = typeof entry === "string"
          ? entry
          : (isPlainObject(entry) ? entry.item_id : null);
        const quantity = isPlainObject(entry) && typeof entry.quantity === "number" && entry.quantity > 0
          ? entry.quantity
          : 1;

        removeItemFromSpotState(spotId, itemId, quantity);
      });
    }

    function applyTimeEffects(effects) {
      if (!isPlainObject(effects.add_time)) return;
      const minutes = typeof effects.add_time.minutes === "number" ? effects.add_time.minutes : 0;
      advanceGameTime(minutes);
    }

    function applyEffects(effects) {
      if (!isPlainObject(effects)) return;
      ensureStateCollections();

      // 1. 数値加算系
      applyNumericAddEffects(effects);

      // 2. 値設定系
      applySetEffects(effects);

      // 3. フラグ操作
      applyFlagEffects(effects);

      // 4. 固有値操作
      applyUniqueValueEffects(effects);

      // 5. 所持品操作
      applyInventoryEffects(effects);

      // 6. スポット上アイテム操作
      applySpotItemEffects(effects);

      // 7. 時間経過
      applyTimeEffects(effects);
    }

    // =========================================================
    // 7. イベント進行
    // =========================================================

    function renderEndingOrGameOverOptions(mode) {
      ui.event.choiceList.innerHTML = "";

      const restartButton = document.createElement("button");
      restartButton.type = "button";
      restartButton.className = "choice-button";
      restartButton.textContent = "最初からやり直す";
      restartButton.addEventListener("click", () => {
        if (!game.loadedSource) {
          setGlobalStatus("warn", "まだ読み込まれた台本がありません。");
          return;
        }
        startScript(game.loadedSource);
        setGlobalStatus("ok", "最初からやり直しました。");
      });

      const continuationButton = document.createElement("button");
      continuationButton.type = "button";
      continuationButton.className = "choice-button";
      continuationButton.textContent = "続篇用プロンプトをコピー";
      continuationButton.addEventListener("click", async () => {
        try {
          await copyTextToClipboard(buildContinuationPrompt());
          setGlobalStatus("ok", "続篇用プロンプトをコピーしました。");
        } catch (error) {
          setGlobalStatus("fail", "続篇プロンプトコピー失敗: " + (error instanceof Error ? error.message : String(error)));
        }
      });

      ui.event.choiceList.appendChild(restartButton);
      ui.event.choiceList.appendChild(continuationButton);

      if (mode === "game_over") {
        setGlobalStatus("fail", "ゲームオーバーです。最初からやり直すか、続篇用プロンプトをコピーできます。");
      } else {
        setGlobalStatus("ok", "エンディングに到達しました。最初からやり直すか、続篇用プロンプトをコピーできます。");
      }
    }

    function enterEvent(eventId) {
      setCurrentEventId(eventId);

      const eventDef = getCurrentEvent();
      if (!eventDef) {
        renderScreen();
        return;
      }

      if (typeof eventDef.spot_id === "string" && eventDef.spot_id.trim()) {
        const playerCharacterId = getPlayerCharacterId();
        if (playerCharacterId) {
          moveCharacterToSpot(playerCharacterId, eventDef.spot_id);
        }
      }

      getVisibleEventTextLines(eventDef).forEach(appendMessageLine);
      renderScreen();
    }

    function redirectToGameOverIfNeeded() {
      const healthValue = getHealthValue();
      if (healthValue === null || healthValue > 0) return false;

      const currentEvent = getCurrentEvent();
      if (currentEvent && currentEvent.event_type === "game_over") {
        return false;
      }

      const activeScenario = getActiveScenario();
      const gameOverEventId = typeof activeScenario?.game_over_event_id === "string"
        ? activeScenario.game_over_event_id.trim()
        : "";

      if (gameOverEventId && getActiveEventById(gameOverEventId)) {
        enterEvent(gameOverEventId);
        setGlobalStatus("fail", "体力が0以下になったため、ゲームオーバーへ遷移しました。");
        return true;
      }

      appendMessageLine("体力が尽きました。");
      renderMessageWindow();
      renderEndingOrGameOverOptions("game_over");
      return true;
    }

    function isRestartChoiceOnGameOver(option) {
      const currentEvent = getCurrentEvent();
      return Boolean(
        currentEvent &&
        currentEvent.event_type === "game_over" &&
        option.next_event_id === null &&
        typeof option.text === "string" &&
        option.text.includes("最初から")
      );
    }

    function handleBlockedOption(option, kind) {
      const message = typeof option.failure_message === "string" && option.failure_message.trim()
        ? option.failure_message
        : "条件を満たしていません。";

      appendMessageLine("▶ " + option.text);
      appendMessageLine(message);
      addLogEntry(`Blocked ${kind}: ${option.text} -> ${message}`);
      renderScreen();
      setGlobalStatus("warn", message);
    }

    function applyOptionSuccess(option, kind) {
      game.stepCount += 1;

      addLogEntry([
        `Step ${game.stepCount}`,
        `Event: ${game.currentEventId || "-"}`,
        `${kind}: ${option.text}`
      ].join("\n"));

      appendMessageLine("▶ " + option.text);
      applyEffects(option.effects);

      if (typeof option.success_message === "string" && option.success_message.trim()) {
        appendMessageLine(option.success_message);
        addLogEntry("Result: " + option.success_message);
      }
    }

    function finishStoryIfTerminalOption() {
      const currentEvent = getCurrentEvent();
      appendMessageLine("この話はこれで終わりです。");
      renderMessageWindow();

      if (currentEvent && currentEvent.event_type === "game_over") {
        renderEndingOrGameOverOptions("game_over");
      } else {
        renderEndingOrGameOverOptions("ending");
      }
    }

    function transitionToNextEvent(nextEventId, kind, optionText) {
      if (typeof nextEventId !== "string" || !nextEventId.trim()) {
        renderScreen();
        return;
      }

      const normalizedNextEventId = nextEventId.trim();

      if (!getActiveEventById(normalizedNextEventId)) {
        const message = "遷移先イベントが存在しません: " + normalizedNextEventId;
        appendMessageLine(message);
        addLogEntry(`Blocked ${kind}: ${optionText} -> ${message}`);
        renderScreen();
        setGlobalStatus("fail", message);
        return;
      }

      enterEvent(normalizedNextEventId);
    }

    function executeActionOrChoice(option, kind) {
      const previousSpotId = getCharacterSpotId(getPlayerCharacterId());

      if (!checkConditions(option.conditions)) {
        handleBlockedOption(option, kind);
        return;
      }

      if (isRestartChoiceOnGameOver(option)) {
        if (!game.loadedSource) {
          setGlobalStatus("warn", "まだ読み込まれた台本がありません。");
          return;
        }
        startScript(game.loadedSource);
        setGlobalStatus("ok", "最初からやり直しました。");
        return;
      }

      applyOptionSuccess(option, kind);

      if (redirectToGameOverIfNeeded()) {
        return;
      }

      if (typeof option.next_event_id === "string" && option.next_event_id.trim()) {
        transitionToNextEvent(option.next_event_id, kind, option.text);
        return;
      }

      const currentSpotId = getCharacterSpotId(getPlayerCharacterId());
      if (currentSpotId && currentSpotId !== previousSpotId) {
        const resolvedEventId = findFirstVisibleEventId(currentSpotId);
        if (resolvedEventId) {
          enterEvent(resolvedEventId);
          return;
        }
      }

      if (option.next_event_id === null) {
        const currentEvent = getCurrentEvent();
        if (currentEvent && (currentEvent.event_type === "ending" || currentEvent.event_type === "game_over")) {
          finishStoryIfTerminalOption();
          return;
        }
      }

      renderScreen();
    }

    // =========================================================
    // 8. 描画
    // =========================================================

    function renderHeaderPanel() {
      ui.header.gameTitle.textContent = game.runtime ? game.runtime.title : "-";
      ui.header.currentEventIdText.textContent = game.currentEventId || "-";
      ui.header.currentSpotIdText.textContent = getDisplaySpotName(
        getCharacterSpotId(getPlayerCharacterId())
      );
      ui.header.currentTimeText.textContent = formatTime(game.state?.time);

      const healthValue = getHealthValue();
      ui.header.healthText.textContent = healthValue === null ? "-" : String(healthValue);
      ui.header.stepText.textContent = String(game.stepCount);
    }

    function renderStatePanel() {
      if (!isPlainObject(game.state)) {
        ui.state.itemsText.textContent = "-";
        ui.state.statePreview.textContent = "状態データなし";
        ui.stateTools.rawStateArea.value = "";
        return;
      }

      const itemNames = getDisplayItemNames();
      ui.state.itemsText.textContent = itemNames.length ? itemNames.join(" / ") : "なし";
      ui.state.statePreview.textContent = buildStateSummary();
      ui.stateTools.rawStateArea.value = JSON.stringify(game.state, null, 2);

      if (game.isRawStateVisible) {
        ui.stateTools.rawStateArea.classList.remove("hidden");
        ui.stateTools.toggleRawStateButton.textContent = "詳細JSONを隠す";
      } else {
        ui.stateTools.rawStateArea.classList.add("hidden");
        ui.stateTools.toggleRawStateButton.textContent = "詳細JSONを表示";
      }
    }

    function renderLogPanel() {
      ui.log.logList.innerHTML = "";

      game.logEntries.slice().reverse().forEach((line) => {
        const item = document.createElement("div");
        item.className = "log-item";
        item.textContent = line;
        ui.log.logList.appendChild(item);
      });
    }

    function renderMessageWindow() {
      ui.event.textArea.innerHTML = "";

      const recentLines = game.messageHistory.slice(-MESSAGE_WINDOW_LIMIT);
      const paddedLines = Array(Math.max(0, MESSAGE_WINDOW_LIMIT - recentLines.length)).fill("").concat(recentLines);

      const messageWindow = document.createElement("div");
      messageWindow.className = "message-window";
      messageWindow.textContent = paddedLines.join("\n");

      ui.event.textArea.appendChild(messageWindow);
    }

    function bindEnabledOptionHandler(button, option, kind) {
      button.addEventListener("click", () => {
        executeActionOrChoice(option, kind);
      });
    }

    function bindBlockedOptionHandler(button, option, kind) {
      button.addEventListener("click", () => {
        appendMessageLine("▶ " + option.text);
        appendMessageLine(option.failure_message);
        addLogEntry(`Blocked ${kind}: ${option.text} -> ${option.failure_message}`);
        renderScreen();
        setGlobalStatus("warn", option.failure_message);
      });
    }

    function buildOptionButton(option, kind, index) {
      const isConditionMet = checkConditions(option.conditions);
      if (!isConditionMet && option.hidden_when_disabled === true) {
        return null;
      }

      const visibleLabel = isConditionMet
        ? option.text
        : (
          typeof option.disabled_text === "string" && option.disabled_text.trim()
            ? option.disabled_text
            : option.text
        );

      const button = document.createElement("button");
      button.type = "button";
      button.className = "choice-button";
      button.textContent = `${index}. ${visibleLabel}`;

      if (isConditionMet) {
        bindEnabledOptionHandler(button, option, kind);
        return button;
      }

      if (typeof option.failure_message === "string" && option.failure_message.trim()) {
        bindBlockedOptionHandler(button, option, kind);
        return button;
      }

      button.disabled = true;
      return button;
    }

    function getNormalMoves(eventDef) {
      const moves = [];
      const playerCharacterId = getPlayerCharacterId();
      if (!playerCharacterId) return moves;

      const currentSpotId = getCharacterSpotId(playerCharacterId);
      const currentSpot = getSpotById(currentSpotId);
      if (!currentSpot || !Array.isArray(currentSpot.connections)) return moves;

      const explicitMoveTargets = new Set();
      if (isPlainObject(eventDef)) {
        [...(Array.isArray(eventDef.actions) ? eventDef.actions : []), ...(Array.isArray(eventDef.choices) ? eventDef.choices : [])]
          .forEach((option) => {
            const targetSpotId = getOptionTargetSpotId(option);
            if (targetSpotId) {
              explicitMoveTargets.add(targetSpotId);
            }
          });
      }

      currentSpot.connections.forEach((connectedSpotId) => {
        if (explicitMoveTargets.has(connectedSpotId)) {
          return;
        }

        if (isMovementAllowed(connectedSpotId)) {
          const spotName = getDisplaySpotName(connectedSpotId);
          moves.push({
            text: `移動: ${spotName}`,
            move_type: "normal",
            target_spot_id: connectedSpotId,
            effects: {
              set: {
                current_spot_id: connectedSpotId,
                [`characters.${playerCharacterId}.spot_id`]: connectedSpotId
              }
            },
            next_event_id: null // 移動後は同じイベントに留まるか、自動遷移？
          });
        }
      });

      return moves;
    }

    function isMovementAllowed(targetSpotId) {
      const movementRules = getActiveScenario()?.movement_rules;
      if (!isPlainObject(movementRules)) return true;
      const targetSpot = getSpotById(targetSpotId);
      if (!targetSpot) return false;

      // default restrictions
      if (isPlainObject(movementRules.default)) {
        const def = movementRules.default;
        if (Array.isArray(def.forbidden_spot_ids) && def.forbidden_spot_ids.includes(targetSpotId)) {
          return false;
        }

        if (Array.isArray(def.allowed_area_ids) && def.allowed_area_ids.length > 0) {
          if (typeof targetSpot.area_id !== "string" || !def.allowed_area_ids.includes(targetSpot.area_id)) {
            return false;
          }
        }

        if (Array.isArray(def.allowed_dungeon_ids) && def.allowed_dungeon_ids.length > 0) {
          if (typeof targetSpot.dungeon_id !== "string" || !def.allowed_dungeon_ids.includes(targetSpot.dungeon_id)) {
            return false;
          }
        }
      }

      // conditional allowances
      if (Array.isArray(movementRules.conditional)) {
        for (const cond of movementRules.conditional) {
          if (isPlainObject(cond) && Array.isArray(cond.allow_spot_ids) && cond.allow_spot_ids.includes(targetSpotId)) {
            if (checkConditions(cond.conditions)) {
              return true;
            }
          }
        }
      }

      // default allow if not forbidden
      return !isPlainObject(movementRules.default) || !Array.isArray(movementRules.default.forbidden_spot_ids) || !movementRules.default.forbidden_spot_ids.includes(targetSpotId);
    }

    function renderOptions(eventDef) {
      ui.event.choiceList.innerHTML = "";

      const orderedOptions = [];

      (Array.isArray(eventDef.actions) ? eventDef.actions : []).forEach((action) => {
        if (isPlainObject(action) && typeof action.text === "string") {
          orderedOptions.push({ kind: "Action", option: action });
        }
      });

      (Array.isArray(eventDef.choices) ? eventDef.choices : []).forEach((choice) => {
        if (isPlainObject(choice) && typeof choice.text === "string") {
          orderedOptions.push({ kind: "Choice", option: choice });
        }
      });

      let index = 1;
      orderedOptions.forEach(({ kind, option }) => {
        const button = buildOptionButton(option, kind, index);
        if (!button) return;

        ui.event.choiceList.appendChild(button);
        index += 1;
      });

      // 通常移動を選択肢の末尾に統合
      const normalMoves = getNormalMoves(eventDef);
      normalMoves.forEach((moveOption, moveIndex) => {
        const button = buildOptionButton(moveOption, "Move", index + moveIndex);
        if (button) {
          ui.event.choiceList.appendChild(button);
        }
      });

      if (!ui.event.choiceList.children.length) {
        setGlobalStatus("fail", "利用可能な選択肢/操作がありません。");
      } else {
        setGlobalStatus("ok", "選択肢または操作を選んで進めてください。");
      }
    }

    function renderScreen() {
      renderHeaderPanel();
      renderStatePanel();

      if (!game.runtime || !game.currentEventId) {
        ui.event.eventTitle.textContent = "-";
        ui.event.speakerLine.textContent = "";
        ui.event.textArea.innerHTML = "";
        ui.event.choiceList.innerHTML = "";
        return;
      }

      const eventDef = getCurrentEvent();
      if (!eventDef) {
        setGlobalStatus("fail", "event が見つかりません: " + game.currentEventId);
        return;
      }

      ui.event.eventTitle.textContent = eventDef.title || game.currentEventId;
      ui.event.speakerLine.textContent = typeof eventDef.speaker === "string" ? eventDef.speaker : "";
      renderMessageWindow();
      renderOptions(eventDef);
    }

    // =========================================================
    // 9. バリデーション
    // =========================================================

    function getValidationScenario(data) {
      const activeScenarioId =
        typeof data.initial_state?.active_scenario_id === "string" && data.initial_state.active_scenario_id.trim()
          ? data.initial_state.active_scenario_id.trim()
          : "";
      return activeScenarioId && isPlainObject(data.scenarios?.[activeScenarioId])
        ? data.scenarios[activeScenarioId]
        : null;
    }

    function getValidationAreaDefinitions(data) {
      const merged = isPlainObject(data.world?.areas) ? cloneJson(data.world.areas) : {};
      const activeScenario = getValidationScenario(data);

      if (isPlainObject(activeScenario?.overlay?.add_areas)) {
        Object.entries(activeScenario.overlay.add_areas).forEach(([areaId, areaDef]) => {
          if (isPlainObject(areaDef)) {
            merged[areaId] = cloneJson(areaDef);
          }
        });
      }

      return merged;
    }

    function getValidationDungeonDefinitions(data) {
      const merged = isPlainObject(data.world?.dungeons) ? cloneJson(data.world.dungeons) : {};
      const activeScenario = getValidationScenario(data);

      if (isPlainObject(activeScenario?.overlay?.add_dungeons)) {
        Object.entries(activeScenario.overlay.add_dungeons).forEach(([dungeonId, dungeonDef]) => {
          if (isPlainObject(dungeonDef)) {
            merged[dungeonId] = cloneJson(dungeonDef);
          }
        });
      }

      return merged;
    }

    function getValidationSpotDefinitions(data) {
      const merged = isPlainObject(data.world?.spots) ? cloneJson(data.world.spots) : {};
      const activeScenario = getValidationScenario(data);

      if (isPlainObject(activeScenario?.overlay?.add_spots)) {
        Object.entries(activeScenario.overlay.add_spots).forEach(([spotId, spotDef]) => {
          if (isPlainObject(spotDef)) {
            merged[spotId] = cloneJson(spotDef);
          }
        });
      }

      if (Array.isArray(activeScenario?.overlay?.disabled_spot_ids)) {
        activeScenario.overlay.disabled_spot_ids.forEach((spotId) => {
          delete merged[spotId];
        });
      }

      return merged;
    }

    function getValidationCharacterDefinitions(data) {
      const merged = isPlainObject(data.definitions?.characters) ? cloneJson(data.definitions.characters) : {};
      const activeScenario = getValidationScenario(data);

      if (isPlainObject(activeScenario?.overlay?.add_characters)) {
        Object.entries(activeScenario.overlay.add_characters).forEach(([characterId, characterDef]) => {
          if (isPlainObject(characterDef)) {
            merged[characterId] = cloneJson(characterDef);
          }
        });
      }

      return merged;
    }

    function getValidationItemDefinitions(data) {
      const merged = isPlainObject(data.definitions?.items) ? cloneJson(data.definitions.items) : {};
      const activeScenario = getValidationScenario(data);

      if (isPlainObject(activeScenario?.overlay?.add_items)) {
        Object.entries(activeScenario.overlay.add_items).forEach(([itemId, itemDef]) => {
          if (isPlainObject(itemDef)) {
            merged[itemId] = cloneJson(itemDef);
          }
        });
      }

      return merged;
    }

    function validateCharacterSpotMap(characterSpotMap, label, errors, data) {
      if (!isPlainObject(characterSpotMap)) {
        errors.push(label + " はオブジェクトである必要があります。");
        return;
      }

      Object.entries(characterSpotMap).forEach(([characterId, spotIds]) => {
        if (!data.initial_state?.characters?.[characterId]) {
          errors.push(`${label}.${characterId} のキャラが initial_state.characters に存在しません: ${characterId}`);
          return;
        }

        if (!Array.isArray(spotIds) || spotIds.length === 0 || spotIds.some((spotId) => typeof spotId !== "string")) {
          errors.push(`${label}.${characterId} は1件以上のスポットID文字列配列である必要があります。`);
          return;
        }

        const spotDefinitions = getValidationSpotDefinitions(data);
        spotIds.forEach((spotId) => {
          if (!spotDefinitions[spotId]) {
            errors.push(`${label}.${characterId} の spot_id が world.spots に存在しません: ${spotId}`);
          }
        });
      });
    }

    function validateConditionsObject(conditions, label, data, errors) {
      if (!isPlainObject(conditions)) return;

      if (conditions.required_character_spots !== undefined) {
        validateCharacterSpotMap(conditions.required_character_spots, `${label}.required_character_spots`, errors, data);
      }

      if (conditions.forbidden_character_spots !== undefined) {
        validateCharacterSpotMap(conditions.forbidden_character_spots, `${label}.forbidden_character_spots`, errors, data);
      }

      if (Array.isArray(conditions.required_items)) {
        conditions.required_items.forEach((item, index) => {
          if (typeof item === "string") return;
          if (!isPlainObject(item) || typeof item.item_id !== "string") {
            errors.push(`${label}.required_items[${index}] は item_id を持つオブジェクトまたは文字列である必要があります。`);
          }
        });
      }
    }

    function validateEffectsObject(effects, label, data, errors) {
      if (!isPlainObject(effects)) return;

      if (isPlainObject(effects.set)) {
        const spotDefinitions = getValidationSpotDefinitions(data);
        Object.entries(effects.set).forEach(([path, value]) => {
          if (path.endsWith(".spot_id") && typeof value === "string" && !spotDefinitions[value]) {
            errors.push(`${label}.set.${path} のスポットIDが world.spots に存在しません: ${value}`);
          }
        });
      }

      if (Array.isArray(effects.add_items)) {
        const itemDefinitions = getValidationItemDefinitions(data);
        effects.add_items.forEach((item, index) => {
          if (typeof item === "string") return;
          if (!isPlainObject(item) || typeof item.item_id !== "string") {
            errors.push(`${label}.add_items[${index}] は item_id を持つオブジェクトまたは文字列である必要があります。`);
            return;
          }
          if (!itemDefinitions[item.item_id]) {
            errors.push(`${label}.add_items[${index}].item_id が definitions.items に存在しません: ${item.item_id}`);
          }
        });
      }

      if (Array.isArray(effects.remove_items)) {
        const itemDefinitions = getValidationItemDefinitions(data);
        effects.remove_items.forEach((item, index) => {
          if (typeof item === "string") {
            if (!itemDefinitions[item]) {
              errors.push(`${label}.remove_items[${index}] の item_id が definitions.items に存在しません: ${item}`);
            }
            return;
          }
          if (!isPlainObject(item) || typeof item.item_id !== "string") {
            errors.push(`${label}.remove_items[${index}] は item_id を持つオブジェクトまたは文字列である必要があります。`);
            return;
          }
          if (!itemDefinitions[item.item_id]) {
            errors.push(`${label}.remove_items[${index}].item_id が definitions.items に存在しません: ${item.item_id}`);
          }
        });
      }

      if (Array.isArray(effects.remove_spot_items)) {
        const itemDefinitions = getValidationItemDefinitions(data);
        const spotDefinitions = getValidationSpotDefinitions(data);
        effects.remove_spot_items.forEach((item, index) => {
          if (typeof item === "string") {
            if (!itemDefinitions[item]) {
              errors.push(`${label}.remove_spot_items[${index}] の item_id が definitions.items に存在しません: ${item}`);
            }
            return;
          }

          if (!isPlainObject(item) || typeof item.item_id !== "string") {
            errors.push(`${label}.remove_spot_items[${index}] は item_id を持つオブジェクトまたは文字列である必要があります。`);
            return;
          }

          if (!itemDefinitions[item.item_id]) {
            errors.push(`${label}.remove_spot_items[${index}].item_id が definitions.items に存在しません: ${item.item_id}`);
          }

          if (typeof item.spot_id === "string" && !spotDefinitions[item.spot_id]) {
            errors.push(`${label}.remove_spot_items[${index}].spot_id が world.spots に存在しません: ${item.spot_id}`);
          }
        });
      }
    }

    function validateTopLevelStructure(data, errors) {
      if (!isPlainObject(data)) {
        errors.push("JSON全体はオブジェクトである必要があります。");
        return;
      }

      if (typeof data.title !== "string" || !data.title.trim()) {
        errors.push("title は空でない文字列である必要があります。");
      }

      if (!isPlainObject(data.definitions)) {
        errors.push("definitions はオブジェクトである必要があります。");
      }

      if (!isPlainObject(data.world)) {
        errors.push("world はオブジェクトである必要があります。");
      }

      if (data.scenarios !== undefined && !isPlainObject(data.scenarios)) {
        errors.push("scenarios は省略可能ですが、存在する場合はオブジェクトである必要があります。");
      }

      if (data.quests !== undefined && !isPlainObject(data.quests)) {
        errors.push("quests は省略可能ですが、存在する場合はオブジェクトである必要があります。");
      }

      if (!isPlainObject(data.initial_state)) {
        errors.push("initial_state はオブジェクトである必要があります。");
      }
    }

    function validateWorldStructure(data, errors) {
      if (data.world?.areas !== undefined && !isPlainObject(data.world?.areas)) {
        errors.push("world.areas は省略可能ですが、存在する場合はオブジェクトである必要があります。");
      }

      if (data.world?.dungeons !== undefined && !isPlainObject(data.world?.dungeons)) {
        errors.push("world.dungeons は省略可能ですが、存在する場合はオブジェクトである必要があります。");
      }

      if (data.world?.spots !== undefined && !isPlainObject(data.world?.spots)) {
        errors.push("world.spots は省略可能ですが、存在する場合はオブジェクトである必要があります。");
        return;
      }

      const areaDefinitions = getValidationAreaDefinitions(data);
      const dungeonDefinitions = getValidationDungeonDefinitions(data);
      const spotDefinitions = getValidationSpotDefinitions(data);

      if (Object.keys(spotDefinitions).length === 0) {
        errors.push("world.spots または active scenario.overlay.add_spots のいずれかに1件以上のスポットが必要です。");
        return;
      }

      Object.entries(spotDefinitions).forEach(([spotId, spot]) => {
        const label = `world.spots.${spotId}`;

        if (!isPlainObject(spot)) {
          errors.push(`${label} はオブジェクトである必要があります。`);
          return;
        }

        if (typeof spot.area_id !== "string" || !spot.area_id.trim()) {
          errors.push(`${label}.area_id は必須の文字列です。`);
        } else if (!areaDefinitions[spot.area_id]) {
          errors.push(`${label}.area_id が world.areas に存在しません: ${spot.area_id}`);
        }

        if (spot.dungeon_id !== undefined) {
          if (typeof spot.dungeon_id !== "string" || !spot.dungeon_id.trim()) {
            errors.push(`${label}.dungeon_id は省略可能ですが、存在する場合は文字列である必要があります。`);
          } else if (!dungeonDefinitions[spot.dungeon_id]) {
            errors.push(`${label}.dungeon_id が world.dungeons に存在しません: ${spot.dungeon_id}`);
          } else {
            const dungeon = dungeonDefinitions[spot.dungeon_id];
            if (typeof dungeon.area_id === "string" && typeof spot.area_id === "string" && dungeon.area_id !== spot.area_id) {
              errors.push(`${label} の area_id (${spot.area_id}) と dungeon.area_id (${dungeon.area_id}) が一致しません。`);
            }
          }
        }

        if (Array.isArray(spot.connections)) {
          spot.connections.forEach((connectedSpotId, index) => {
            if (typeof connectedSpotId !== "string") {
              errors.push(`${label}.connections[${index}] は文字列である必要があります。`);
            } else if (!spotDefinitions[connectedSpotId]) {
              errors.push(`${label}.connections[${index}] が world.spots に存在しません: ${connectedSpotId}`);
            }
          });
        }
      });
    }

    function validateInitialState(data, errors) {
      if (!isPlainObject(data.initial_state?.characters)) {
        errors.push("initial_state.characters はオブジェクトである必要があります。");
      }

      if (!isPlainObject(data.initial_state?.spot_states)) {
        errors.push("initial_state.spot_states はオブジェクトである必要があります。");
      }

      if (!isPlainObject(data.initial_state?.time)) {
        errors.push("initial_state.time はオブジェクトである必要があります。");
      }

      if (typeof data.initial_state?.player_character_id !== "string" || !data.initial_state.player_character_id.trim()) {
        errors.push("initial_state.player_character_id は空でない文字列である必要があります。");
      }

      if (
        typeof data.initial_state?.active_scenario_id === "string" &&
        data.initial_state.active_scenario_id.trim() &&
        !isPlainObject(data.scenarios?.[data.initial_state.active_scenario_id.trim()])
      ) {
        errors.push(`initial_state.active_scenario_id が scenarios に存在しません: ${data.initial_state.active_scenario_id}`);
      }

      if (data.initial_state?.active_quest_ids !== undefined && !Array.isArray(data.initial_state.active_quest_ids)) {
        errors.push("initial_state.active_quest_ids は省略可能ですが、存在する場合は配列である必要があります。");
      }

      if (
        typeof data.initial_state?.primary_quest_id === "string" &&
        data.initial_state.primary_quest_id.trim() &&
        !isPlainObject(data.quests?.[data.initial_state.primary_quest_id.trim()])
      ) {
        errors.push(`initial_state.primary_quest_id が quests に存在しません: ${data.initial_state.primary_quest_id}`);
      }

      if (
        typeof data.initial_state?.player_character_id === "string" &&
        !isPlainObject(data.initial_state?.characters?.[data.initial_state.player_character_id])
      ) {
        errors.push("initial_state.player_character_id に対応する characters エントリが存在しません。");
      }

      const spotDefinitions = getValidationSpotDefinitions(data);
      const itemDefinitions = getValidationItemDefinitions(data);

      if (isPlainObject(data.initial_state?.characters)) {
        Object.entries(data.initial_state.characters).forEach(([characterId, character]) => {
          if (!isPlainObject(character)) {
            errors.push(`initial_state.characters.${characterId} はオブジェクトである必要があります。`);
            return;
          }

          if (typeof character.spot_id === "string" && character.spot_id.trim() && !spotDefinitions[character.spot_id]) {
            errors.push(`initial_state.characters.${characterId}.spot_id が world.spots に存在しません: ${character.spot_id}`);
          }
        });
      }

      if (isPlainObject(data.initial_state?.spot_states)) {
        Object.entries(data.initial_state.spot_states).forEach(([spotId, spotState]) => {
          if (!spotDefinitions[spotId]) {
            errors.push(`initial_state.spot_states.${spotId} は対応する world.spots が存在しません。`);
            return;
          }

          if (!isPlainObject(spotState)) {
            errors.push(`initial_state.spot_states.${spotId} はオブジェクトである必要があります。`);
            return;
          }

          if (Array.isArray(spotState.items)) {
            spotState.items.forEach((item, index) => {
              if (!isPlainObject(item) || typeof item.item_id !== "string") {
                errors.push(`initial_state.spot_states.${spotId}.items[${index}] は item_id を持つオブジェクトである必要があります。`);
                return;
              }
              if (!itemDefinitions[item.item_id]) {
                errors.push(`initial_state.spot_states.${spotId}.items[${index}].item_id が definitions.items に存在しません: ${item.item_id}`);
              }
            });
          }
        });
      }
    }

    function eventExistsInData(data, eventId) {
      if (typeof eventId !== "string" || !eventId.trim()) return false;

      if (isPlainObject(data.world?.base_events?.[eventId])) {
        return true;
      }

      if (!isPlainObject(data.scenarios)) {
        return false;
      }

      return Object.values(data.scenarios).some((scenarioDef) =>
        isPlainObject(scenarioDef?.events?.[eventId])
      );
    }

    function validateOptionDefinition(option, label, data, errors) {
      if (!isPlainObject(option)) {
        errors.push(label + " はオブジェクトである必要があります。");
        return;
      }

      if (typeof option.text !== "string" || !option.text.trim()) {
        errors.push(label + ".text は空でない文字列である必要があります。");
      }

      if (option.next_event_id !== undefined && option.next_event_id !== null && typeof option.next_event_id !== "string") {
        errors.push(label + ".next_event_id は文字列または null である必要があります。");
      }

      if (typeof option.next_event_id === "string" && !eventExistsInData(data, option.next_event_id)) {
        errors.push(label + ".next_event_id が存在しません: " + option.next_event_id);
      }

      if (option.conditions !== undefined && !isPlainObject(option.conditions)) {
        errors.push(label + ".conditions はオブジェクトである必要があります。");
      }

      if (option.effects !== undefined && !isPlainObject(option.effects)) {
        errors.push(label + ".effects はオブジェクトである必要があります。");
      }

      validateConditionsObject(option.conditions, `${label}.conditions`, data, errors);
      validateEffectsObject(option.effects, `${label}.effects`, data, errors);
    }

    function validateScenarioEvents(data, errors) {
      Object.entries(data.quests || {}).forEach(([questId, questDef]) => {
        const label = `quests.${questId}`;
        if (!isPlainObject(questDef)) {
          errors.push(`${label} はオブジェクトである必要があります。`);
          return;
        }

        if (Array.isArray(questDef.related_scenario_ids)) {
          questDef.related_scenario_ids.forEach((scenarioId, index) => {
            if (typeof scenarioId !== "string") {
              errors.push(`${label}.related_scenario_ids[${index}] は文字列である必要があります。`);
            } else if (!data.scenarios?.[scenarioId]) {
              errors.push(`${label}.related_scenario_ids[${index}] が scenarios に存在しません: ${scenarioId}`);
            }
          });
        }
      });

      Object.entries(data.scenarios || {}).forEach(([scenarioId, scenarioDef]) => {
        const scenarioLabel = `scenarios.${scenarioId}`;
        if (!isPlainObject(scenarioDef)) {
          errors.push(`${scenarioLabel} はオブジェクトである必要があります。`);
          return;
        }

        if (!isPlainObject(scenarioDef.events) || Object.keys(scenarioDef.events).length === 0) {
          return;
        }

        Object.entries(scenarioDef.events).forEach(([eventId, eventDef]) => {
          const label = `${scenarioLabel}.events.${eventId}`;

          if (!isMeaningfulId(eventId)) {
            errors.push(label + " のIDは意味ベース英小文字IDにしてください。");
          }

          if (!isPlainObject(eventDef)) {
            errors.push(label + " はオブジェクトである必要があります。");
            return;
          }

          if (typeof eventDef.title !== "string") {
            errors.push(label + ".title は文字列である必要があります。");
          }

          const text = eventDef.text;
          if (!(typeof text === "string" || (Array.isArray(text) && text.every((line) => typeof line === "string")))) {
            errors.push(label + ".text は文字列または文字列配列である必要があります。");
          }

          if (eventDef.spot_id !== undefined && typeof eventDef.spot_id !== "string") {
            errors.push(label + ".spot_id は文字列である必要があります。");
          }

          const spotDefinitions = getValidationSpotDefinitions(data);
          if (typeof eventDef.spot_id === "string" && eventDef.spot_id.trim() && !data.world?.spots?.[eventDef.spot_id]) {
            if (!spotDefinitions[eventDef.spot_id]) {
              errors.push(label + ".spot_id が world.spots に存在しません: " + eventDef.spot_id);
            }
          }

          if (Array.isArray(eventDef.participants)) {
            eventDef.participants.forEach((characterId, index) => {
              if (typeof characterId !== "string") {
                errors.push(`${label}.participants[${index}] は文字列である必要があります。`);
              } else if (!data.initial_state?.characters?.[characterId]) {
                errors.push(`${label}.participants[${index}] のキャラが initial_state.characters に存在しません: ${characterId}`);
              }
            });
          }

          if (Array.isArray(eventDef.conditional_texts)) {
            eventDef.conditional_texts.forEach((entry, index) => {
              if (!isPlainObject(entry)) {
                errors.push(`${label}.conditional_texts[${index}] はオブジェクトである必要があります。`);
                return;
              }

              validateConditionsObject(entry.conditions, `${label}.conditional_texts[${index}].conditions`, data, errors);

              if (!(typeof entry.text === "string" || (Array.isArray(entry.text) && entry.text.every((line) => typeof line === "string")))) {
                errors.push(`${label}.conditional_texts[${index}].text は文字列または文字列配列である必要があります。`);
              }
            });
          }

          const actions = Array.isArray(eventDef.actions) ? eventDef.actions : [];
          const choices = Array.isArray(eventDef.choices) ? eventDef.choices : [];

          if (actions.length === 0 && choices.length === 0) {
            errors.push(label + " は actions または choices のいずれか1件以上が必要です。");
          }

          actions.forEach((action, index) => {
            validateOptionDefinition(action, `${label}.actions[${index}]`, data, errors);
          });

          choices.forEach((choice, index) => {
            validateOptionDefinition(choice, `${label}.choices[${index}]`, data, errors);
          });
        });
        if (
          typeof scenarioDef.start_event_id === "string" &&
          scenarioDef.start_event_id.trim() &&
          !isPlainObject(scenarioDef.events?.[scenarioDef.start_event_id.trim()])
        ) {
          errors.push(`${scenarioLabel}.start_event_id が ${scenarioLabel}.events に存在しません。`);
        }

        if (
          typeof scenarioDef.game_over_event_id === "string" &&
          scenarioDef.game_over_event_id.trim() &&
          !isPlainObject(scenarioDef.events?.[scenarioDef.game_over_event_id.trim()])
        ) {
          errors.push(`${scenarioLabel}.game_over_event_id が ${scenarioLabel}.events に存在しません。`);
        }
      });

      const activeScenarioId =
        typeof data.initial_state?.active_scenario_id === "string" && data.initial_state.active_scenario_id.trim()
          ? data.initial_state.active_scenario_id.trim()
          : "";
      const activeScenario = activeScenarioId ? data.scenarios?.[activeScenarioId] : null;
      const startEventId =
        typeof data.initial_state?.current_event_id === "string" && data.initial_state.current_event_id.trim()
          ? data.initial_state.current_event_id.trim()
          : (typeof activeScenario?.start_event_id === "string" ? activeScenario.start_event_id.trim() : "");

      if (startEventId && !eventExistsInData(data, startEventId)) {
        errors.push("開始イベントが存在しません: " + startEventId);
      }

      if (!startEventId) {
        const playerCharacterId = data.initial_state?.player_character_id;
        const startSpotId =
          typeof playerCharacterId === "string" &&
          typeof data.initial_state?.characters?.[playerCharacterId]?.spot_id === "string"
            ? data.initial_state.characters[playerCharacterId].spot_id
            : "";
        const hasBaseStartEvent =
          isPlainObject(data.world?.base_events) &&
          Object.values(data.world.base_events).some((event) => isPlainObject(event) && event.spot_id === startSpotId);
        const hasScenarioStartEvent =
          isPlainObject(activeScenario?.events) &&
          Object.values(activeScenario.events).some((event) => isPlainObject(event) && event.spot_id === startSpotId);

        if (!hasBaseStartEvent && !hasScenarioStartEvent) {
          errors.push("開始イベントがありません。initial_state.current_event_id、active scenario の start_event_id、または開始地点に対応する event が必要です。");
        }
      }
    }

    function validateScript(data) {
      const normalizedData = normalizeScriptStructure(data);
      const errors = [];

      validateTopLevelStructure(normalizedData, errors);
      if (errors.length > 0 && !isPlainObject(normalizedData)) {
        return errors;
      }

      validateWorldStructure(normalizedData, errors);
      validateInitialState(normalizedData, errors);
      validateScenarioEvents(normalizedData, errors);

      return errors;
    }

    // =========================================================
    // 10. 入出力
    // =========================================================

    function buildContinuationPrompt() {
      const payload = {
        title: game.runtime?.title || null,
        current_event_id: game.currentEventId || null,
        current_spot_id: getCharacterSpotId(getPlayerCharacterId()) || null,
        time: game.state?.time || null,
        step: game.stepCount,
        state: game.state,
        log: game.logEntries
      };

      return [
        "以下の引き継ぎ情報を使って、続篇となる新しいJSON台本を1つ作成してください。",
        "既存JSONへの追記ではなく、新しい別JSONとして作成してください。",
        "新仕様専用です。top-level は definitions / world / scenarios / quests / initial_state を使ってください。",
        "有効な世界差分は initial_state.active_scenario_id で指定し、進行中クエストは active_quest_ids / primary_quest_id / quest_states で管理してください。",
        "進行は active scenario の events と current_event_id / next_event_id で行ってください。",
        "inventory は initial_state.characters[character_id].inventory を使ってください。",
        "spot 上アイテムは initial_state.spot_states を使ってください。",
        "NPC位置は characters.<id>.spot_id で管理してください。",
        "条件では required_character_spots / forbidden_character_spots を使ってよいです。",
        "時刻は initial_state.time を使ってください。",
        "",
        "【引き継ぎ情報(JSON)】",
        JSON.stringify(payload, null, 2),
        "",
        "【出力形式】",
        "- コードブロックは1つのみ",
        "- コードブロックの中身は純粋なJSONのみ",
        "- JSON以外の説明文・前置き・注釈は禁止"
      ].join("\n");
    }

    async function copyCurrentState() {
      const payload = {
        title: game.runtime?.title || null,
        current_event_id: game.currentEventId || null,
        current_spot_id: getCharacterSpotId(getPlayerCharacterId()) || null,
        time: game.state?.time || null,
        step: game.stepCount,
        state: game.state,
        log: game.logEntries
      };

      await copyTextToClipboard(JSON.stringify(payload, null, 2));
    }

    function getAvailableSamples() {
      if (SAMPLE_REGISTRY.length > 0) {
        return SAMPLE_REGISTRY.filter((entry) => isPlainObject(entry) && isPlainObject(entry.data));
      }

      return isPlainObject(SAMPLE_SCENARIO)
        ? [{ id: "default", title: SAMPLE_SCENARIO.title || "サンプル", data: SAMPLE_SCENARIO }]
        : [];
    }

    function populateSampleOptions() {
      const select = ui.setup.sampleSelect;
      if (!select) return;

      select.innerHTML = "";
      getAvailableSamples().forEach((sample, index) => {
        const option = document.createElement("option");
        option.value = sample.id || `sample_${index + 1}`;
        option.textContent = sample.title || option.value;
        select.appendChild(option);
      });
    }

    function loadExampleIntoTextarea() {
      const samples = getAvailableSamples();
      const selectedId = ui.setup.sampleSelect?.value || "";
      const sample =
        samples.find((entry) => entry.id === selectedId) ||
        samples[0] ||
        { title: "サンプル", data: SAMPLE_SCENARIO };

      ui.setup.scriptInput.value = JSON.stringify(sample.data, null, 2);
      setGlobalStatus("ok", `${sample.title || "サンプル"} を読み込みました。`);
    }

    async function handleCopyPrompt() {
      try {
        const prompt = ui.setup.promptModeSelect.value === "shindo" ? SHINDO_PROMPT : GENERIC_PROMPT;
        await copyTextToClipboard(prompt);
        setGlobalStatus("ok", "AI用プロンプトをコピーしました。");
      } catch (error) {
        setGlobalStatus("fail", "コピー失敗: " + (error instanceof Error ? error.message : String(error)));
      }
    }

    async function handlePasteScript() {
      try {
        ui.setup.scriptInput.value = "";
        ui.setup.scriptInput.value = await readTextFromClipboard();
        setGlobalStatus("ok", "JSON入力欄を全削除し、クリップボードの内容を貼り付けました。");
      } catch (error) {
        setGlobalStatus("fail", "貼り付け失敗: " + (error instanceof Error ? error.message : String(error)));
      }
    }

    async function handleJsonFileSelected(event) {
      const file = event.target.files && event.target.files[0];
      if (!file) return;

      try {
        const text = await file.text();
        ui.setup.scriptInput.value = text;
        setGlobalStatus("ok", `JSONファイルを読み込みました: ${file.name}`);
      } catch (error) {
        setGlobalStatus("fail", "ファイル読込失敗: " + (error instanceof Error ? error.message : String(error)));
      } finally {
        event.target.value = "";
      }
    }

    function startScript(source) {
      const normalizedSource = normalizeScriptStructure(source);

      game.loadedSource = cloneJson(normalizedSource);
      game.runtime = cloneJson(normalizedSource);
      game.state = cloneJson(normalizedSource.initial_state || {});
      ensureStateCollections();

      game.stepCount = 0;
      game.logEntries = [];
      game.messageHistory = [];

      // 互換用: initial_state.current_spot_id を player.spot_id に同期
      if (typeof game.state.current_spot_id === "string" && game.state.current_spot_id.trim()) {
        const playerCharacterId = getPlayerCharacterId();
        if (playerCharacterId) {
          moveCharacterToSpot(playerCharacterId, game.state.current_spot_id);
        }
      }

      addLogEntry("開始: " + (normalizedSource.title || "Untitled"));

      const activeScenario = getActiveScenario();

      const startEventId =
        typeof game.state.current_event_id === "string" && game.state.current_event_id.trim()
          ? game.state.current_event_id.trim()
          : (typeof activeScenario?.start_event_id === "string" ? activeScenario.start_event_id.trim() : "");

      setCurrentEventId(startEventId);

      if (!startEventId) {
        const fallbackEventId = findFirstVisibleEventId();
        if (fallbackEventId) {
          setCurrentEventId(fallbackEventId);
          enterEvent(fallbackEventId);
          setGlobalStatus("ok", "開始地点のイベントを表示しました。");
          return;
        }

        renderScreen();
        setGlobalStatus("fail", "開始イベントが設定されていません。");
        return;
      }

      if (redirectToGameOverIfNeeded()) return;
      enterEvent(startEventId);
    }

    function loadScriptFromTextarea() {
      const parsed = parseJsonSafely(ui.setup.scriptInput.value.trim());

      if (!parsed.ok) {
        setGlobalStatus("fail", "JSON解析失敗:\n" + parsed.error);
        return;
      }

      const errors = validateScript(parsed.data);
      if (errors.length > 0) {
        setGlobalStatus("fail", "台本エラー:\n" + errors.join("\n"));
        return;
      }

      startScript(parsed.data);
      setGlobalStatus("ok", "台本を読み込みました。");
    }

    function restartLoaded() {
      if (!game.loadedSource) {
        setGlobalStatus("warn", "まだ読み込まれた台本がありません。");
        return;
      }

      startScript(game.loadedSource);
      setGlobalStatus("ok", "最初からやり直しました。");
    }

    // =========================================================
    // 11. UIイベント登録
    // =========================================================

    function bindUiEvents() {
      ui.setup.loadExampleButton.addEventListener("click", loadExampleIntoTextarea);

      ui.setup.openFileButton.addEventListener("click", () => {
        ui.setup.jsonFileInput.click();
      });

      ui.setup.jsonFileInput.addEventListener("change", handleJsonFileSelected);
      ui.setup.copyPromptButton.addEventListener("click", handleCopyPrompt);
      ui.setup.pasteScriptButton.addEventListener("click", handlePasteScript);
      ui.setup.loadScriptButton.addEventListener("click", loadScriptFromTextarea);
      ui.setup.restartButton.addEventListener("click", restartLoaded);

      ui.setup.copyStatusButton.addEventListener("click", async () => {
        try {
          await copyTextToClipboard(ui.status.globalStatus.textContent || "");
          setGlobalStatus("ok", "通知欄の内容をコピーしました。");
        } catch (error) {
          setGlobalStatus("fail", "通知コピー失敗: " + (error instanceof Error ? error.message : String(error)));
        }
      });

      ui.setup.copyStateButton.addEventListener("click", async () => {
        try {
          await copyCurrentState();
          setGlobalStatus("ok", "現在状態をコピーしました。");
        } catch (error) {
          setGlobalStatus("fail", "状態コピー失敗: " + (error instanceof Error ? error.message : String(error)));
        }
      });

      ui.setup.copyContinuationButton.addEventListener("click", async () => {
        try {
          await copyTextToClipboard(buildContinuationPrompt());
          setGlobalStatus("ok", "続篇用プロンプトをコピーしました。");
        } catch (error) {
          setGlobalStatus("fail", "続篇プロンプトコピー失敗: " + (error instanceof Error ? error.message : String(error)));
        }
      });

      ui.stateTools.toggleRawStateButton.addEventListener("click", () => {
        game.isRawStateVisible = !game.isRawStateVisible;
        renderStatePanel();
      });
    }

    // =========================================================
    // 12. 初期化
    // =========================================================

    function initialize() {
      renderHeaderPanel();
      renderStatePanel();
      renderLogPanel();
      populateSampleOptions();
      bindUiEvents();
      loadExampleIntoTextarea();
    }

    initialize();
  })();

