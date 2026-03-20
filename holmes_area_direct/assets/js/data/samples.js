window.HOLMES_SAMPLE_REGISTRY = window.HOLMES_SAMPLE_REGISTRY || [];

window.HOLMES_SAMPLE_REGISTRY.push({
  id: "holmes_escape_world",
  title: "ホームズ: ワールド併用型",
  data: window.HOLMES_SAMPLE_SCENARIO
});

window.HOLMES_SAMPLE_REGISTRY.push({
  id: "holmes_escape_scenario_only",
  title: "ホームズ: シナリオ主導型",
  data: (() => {
    const sample = JSON.parse(JSON.stringify(window.HOLMES_SAMPLE_SCENARIO));
    const scenarioId = typeof sample.initial_state?.active_scenario_id === "string" && sample.initial_state.active_scenario_id.trim()
      ? sample.initial_state.active_scenario_id.trim()
      : "main_scenario";
    const scenarioDef = sample.scenarios?.[scenarioId] || sample.scenario || {};

    scenarioDef.overlay = scenarioDef.overlay || {};
    scenarioDef.overlay.add_areas = JSON.parse(JSON.stringify(sample.world?.areas || {}));
    scenarioDef.overlay.add_dungeons = JSON.parse(JSON.stringify(sample.world?.dungeons || {}));
    scenarioDef.overlay.add_spots = JSON.parse(JSON.stringify(sample.world?.spots || {}));
    scenarioDef.overlay.add_characters = JSON.parse(JSON.stringify(sample.definitions?.characters || {}));
    scenarioDef.overlay.add_items = JSON.parse(JSON.stringify(sample.definitions?.items || {}));

    sample.title = `${sample.title}（シナリオ主導型）`;
    sample.world = sample.world || {};
    sample.world.areas = {};
    sample.world.dungeons = {};
    sample.world.spots = {};
    sample.world.base_events = {};
    sample.definitions = sample.definitions || {};
    sample.definitions.characters = {};
    sample.definitions.items = {};

    if (!sample.scenarios) {
      sample.scenarios = {};
    }
    sample.scenarios[scenarioId] = scenarioDef;
    delete sample.scenario;

    return sample;
  })()
});
