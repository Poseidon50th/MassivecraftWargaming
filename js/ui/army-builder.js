import {
  ARMY_UNIT_TYPES,
  MAX_ARTILLERY,
  armyLimitForSize,
  armyTotal,
  armyValidationError,
  defaultArmyForSize,
  normalizeArmy,
} from "../data/armies.js";
import { UNIT_DEFS } from "../engine/constants.js";

const UNIT_ASSETS = Object.freeze({
  sword: "assets/units/swords.png",
  spear: "assets/units/spears.png",
  axe: "assets/units/axes.png",
  cavalry: "assets/units/cavalry.png",
  musket: "assets/units/muskets.png",
  artillery: "assets/units/artillery.png",
});

export function createArmyBuilder(container, {
  size = 8,
  army = defaultArmyForSize(size),
  disabled = false,
  onChange = () => {},
} = {}) {
  let currentSize = Number(size) === 16 ? 16 : 8;
  let currentArmy = normalizeArmy(army);
  let isDisabled = Boolean(disabled);

  function notify() {
    const value = normalizeArmy(currentArmy);
    onChange(value, {
      total: armyTotal(value),
      limit: armyLimitForSize(currentSize),
      error: armyValidationError(value, currentSize),
    });
  }

  function change(type, requested) {
    if (isDisabled) return;
    const limit = armyLimitForSize(currentSize);
    const typeMaximum = type === "artillery" ? MAX_ARTILLERY : limit;
    const next = Math.max(0, Math.min(typeMaximum, Number.isFinite(requested) ? Math.trunc(requested) : 0));
    const withoutType = armyTotal(currentArmy) - currentArmy[type];
    currentArmy[type] = Math.min(next, Math.max(0, limit - withoutType));
    render();
    notify();
  }

  function render() {
    const limit = armyLimitForSize(currentSize);
    const total = armyTotal(currentArmy);
    const error = armyValidationError(currentArmy, currentSize);
    container.replaceChildren();
    container.className = `army-builder${isDisabled ? " disabled" : ""}`;

    const rows = document.createElement("div");
    rows.className = "army-builder-rows";
    for (const type of ARMY_UNIT_TYPES) {
      const row = document.createElement("div");
      row.className = "army-builder-row";
      const identity = document.createElement("span");
      identity.className = "army-builder-unit";
      identity.innerHTML = `<img src="${UNIT_ASSETS[type]}" alt="" /><strong>${UNIT_DEFS[type].name}</strong>`;
      const controls = document.createElement("span");
      controls.className = "army-count-controls";
      const minus = document.createElement("button");
      minus.type = "button";
      minus.textContent = "−";
      minus.setAttribute("aria-label", `Remove one ${UNIT_DEFS[type].name} unit`);
      minus.disabled = isDisabled || currentArmy[type] <= 0;
      minus.addEventListener("click", () => change(type, currentArmy[type] - 1));
      const input = document.createElement("input");
      input.type = "number";
      input.min = "0";
      input.max = String(type === "artillery" ? MAX_ARTILLERY : limit);
      input.step = "1";
      input.inputMode = "numeric";
      input.value = String(currentArmy[type]);
      input.disabled = isDisabled;
      input.setAttribute("aria-label", `${UNIT_DEFS[type].name} count`);
      input.addEventListener("change", () => change(type, Number(input.value)));
      const plus = document.createElement("button");
      plus.type = "button";
      plus.textContent = "+";
      plus.setAttribute("aria-label", `Add one ${UNIT_DEFS[type].name} unit`);
      plus.disabled = isDisabled || total >= limit || (type === "artillery" && currentArmy[type] >= MAX_ARTILLERY);
      plus.addEventListener("click", () => change(type, currentArmy[type] + 1));
      controls.append(minus, input, plus);
      row.append(identity, controls);
      rows.append(row);
    }

    const footer = document.createElement("div");
    footer.className = "army-builder-footer";
    const summary = document.createElement("p");
    summary.className = `army-total${error ? " invalid" : " valid"}`;
    summary.innerHTML = `<strong>${total} / ${limit}</strong> units selected <span>· Artillery ${currentArmy.artillery} / ${MAX_ARTILLERY}</span>`;
    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "text-button compact";
    reset.textContent = "Restore standard army";
    reset.disabled = isDisabled;
    reset.addEventListener("click", () => {
      currentArmy = defaultArmyForSize(currentSize);
      render();
      notify();
    });
    footer.append(summary, reset);
    if (error) {
      const status = document.createElement("p");
      status.className = "army-error";
      status.textContent = error;
      footer.append(status);
    } else if (total === currentArmy.artillery) {
      const warning = document.createElement("p");
      warning.className = "army-warning";
      warning.textContent = "Warning: an Artillery-only army has no safe movement and will lose at the opening victory check.";
      footer.append(warning);
    }
    container.append(rows, footer);
  }

  function setSize(nextSize, { reset = true } = {}) {
    currentSize = Number(nextSize) === 16 ? 16 : 8;
    currentArmy = reset ? defaultArmyForSize(currentSize) : normalizeArmy(currentArmy);
    render();
    notify();
  }

  function setArmy(nextArmy) {
    currentArmy = normalizeArmy(nextArmy);
    render();
    notify();
  }

  function setDisabled(nextDisabled) {
    isDisabled = Boolean(nextDisabled);
    render();
  }

  render();
  notify();
  return {
    getArmy: () => normalizeArmy(currentArmy),
    getSize: () => currentSize,
    setSize,
    setArmy,
    setDisabled,
    render,
  };
}
