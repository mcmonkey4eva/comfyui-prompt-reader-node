/**
 * Modified from: https://github.com/rgthree/rgthree-comfy/blob/main/web/seed.js
 * Modified by: receyuki
 */
import {app} from "../../scripts/app.js";
import {ComfyWidgets} from "../../scripts/widgets.js";

const LAST_SEED_BUTTON_LABEL = "(Use Last Queued Seed)";
const SPECIAL_SEED_RANDOM = -1;
const SPECIAL_SEED_INCREMENT = -2;
const SPECIAL_SEED_DECREMENT = -3;
const SPECIAL_SEEDS = [SPECIAL_SEED_RANDOM, SPECIAL_SEED_INCREMENT, SPECIAL_SEED_DECREMENT];

class SeedControl {
    constructor(node) {
        this.lastSeed = undefined;
        this.serializedCtx = {};
        this.lastSeedValue = null;
        this.node = node;
        this.node.constructor.exposedActions = ["Randomize seed each time", "Use last queued seed"];
        const handleAction = this.node.handleAction;
        this.node.handleAction = async (action) => {
            handleAction && handleAction.call(this.node, action);
            if (action === "Randomize each time") {
                this.seedWidget.value = SPECIAL_SEED_RANDOM;
            } else if (action === "Use last queued seed") {
                this.seedWidget.value = this.lastSeed != null ? this.lastSeed : this.seedWidget.value;
                this.lastSeedButton.name = LAST_SEED_BUTTON_LABEL;
                this.lastSeedButton.disabled = true;
            }
        };
        this.node.properties = this.node.properties || {};
        for (const [i, w] of this.node.widgets.entries()) {
            if (w.name === "seed") {
                this.seedWidget = w;
            } else if (w.name === "control_after_generate") {
                this.node.widgets.splice(i, 1);
            }
        }
        if (!this.seedWidget) {
            throw new Error("Something's wrong; expected seed widget");
        }
        const randMax = Math.min(1125899906842624, this.seedWidget.options.max);
        const randMin = Math.max(0, this.seedWidget.options.min);
        const randomRange = (randMax - Math.max(0, randMin)) / (this.seedWidget.options.step / 10);
        this.node.addWidget("button", "Randomize seed each time", null, () => {
            this.seedWidget.value = SPECIAL_SEED_RANDOM;
        }, {serialize: false});
        this.node.addWidget("button", "New fixed random seed", null, () => {
            this.seedWidget.value =
                Math.floor(Math.random() * randomRange) * (this.seedWidget.options.step / 10) + randMin;
        }, {serialize: false});
        this.lastSeedButton = this.node.addWidget("button", LAST_SEED_BUTTON_LABEL, null, () => {
            this.seedWidget.value = this.lastSeed != null ? this.lastSeed : this.seedWidget.value;
            this.lastSeedButton.name = LAST_SEED_BUTTON_LABEL;
            this.lastSeedButton.disabled = true;
        }, {serialize: false});
        this.lastSeedButton.disabled = true;
        this.seedWidget.serializeValue = async (node, index) => {
            const inputSeed = this.seedWidget.value;
            this.serializedCtx = {
                inputSeed: this.seedWidget.value,
            };
            if (SPECIAL_SEEDS.includes(this.serializedCtx.inputSeed)) {
                if (typeof this.lastSeed === "number" && !SPECIAL_SEEDS.includes(this.lastSeed)) {
                    if (inputSeed === SPECIAL_SEED_INCREMENT) {
                        this.serializedCtx.seedUsed = this.lastSeed + 1;
                    } else if (inputSeed === SPECIAL_SEED_DECREMENT) {
                        this.serializedCtx.seedUsed = this.lastSeed - 1;
                    }
                }
                if (!this.serializedCtx.seedUsed || SPECIAL_SEEDS.includes(this.serializedCtx.seedUsed)) {
                    this.serializedCtx.seedUsed =
                        Math.floor(Math.random() * randomRange) * (this.seedWidget.options.step / 10) + randMin;
                }
            } else {
                this.serializedCtx.seedUsed = this.seedWidget.value;
            }
            node.widgets_values[index] = this.serializedCtx.seedUsed;
            this.seedWidget.value = this.serializedCtx.seedUsed;
            this.lastSeed = this.serializedCtx.seedUsed;
            if (SPECIAL_SEEDS.includes(this.serializedCtx.inputSeed)) {
                this.lastSeedButton.name = `${this.serializedCtx.seedUsed}`;
                this.lastSeedButton.disabled = false;
                if (this.lastSeedValue) {
                    this.lastSeedValue.value = `Last Seed: ${this.serializedCtx.seedUsed}`;
                }
            } else {
                this.lastSeedButton.name = LAST_SEED_BUTTON_LABEL;
                this.lastSeedButton.disabled = true;
            }
            return this.serializedCtx.seedUsed;
        };
        this.seedWidget.afterQueued = () => {
            if (this.serializedCtx.inputSeed) {
                this.seedWidget.value = this.serializedCtx.inputSeed;
            }
            this.serializedCtx = {};
        };
        this.node.getExtraMenuOptions = (_, options) => {
            options.splice(options.length - 1, 0, {
                content: "Show/Hide Last Seed Value",
                callback: (_value, _options, _event, _parentMenu, _node) => {
                    this.node.properties["showLastSeed"] = !this.node.properties["showLastSeed"];
                    if (this.node.properties["showLastSeed"]) {
                        this.addLastSeedValue();
                    } else {
                        this.removeLastSeedValue();
                    }
                },
            });
        };
    }

    addLastSeedValue() {
        if (this.lastSeedValue)
            return;
        this.lastSeedValue = ComfyWidgets["STRING"](this.node, "last_seed", ["STRING", {multiline: true}], app).widget;
        this.lastSeedValue.inputEl.readOnly = true;
        this.lastSeedValue.inputEl.style.fontSize = "0.75rem";
        this.lastSeedValue.inputEl.style.textAlign = "center";
        this.lastSeedValue.serializeValue = async (node, index) => {
            node.widgets_values[index] = "";
            return "";
        };
        this.node.computeSize();
    }

    removeLastSeedValue() {
        if (!this.lastSeedValue)
            return;
        this.lastSeedValue.inputEl.remove();
        this.node.widgets.splice(this.node.widgets.indexOf(this.lastSeedValue), 1);
        this.lastSeedValue = null;
        this.node.computeSize();
    }
}

app.registerExtension({
    name: "sd_prompt_reader.seedGen",
    async beforeRegisterNodeDef(nodeType, nodeData, _app) {
        if (nodeData.name === "SDParameterGenerator") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                const result = onNodeCreated?.apply(this, []);
                this.seedControl = new SeedControl(this);
                const nodeWidth = this.size[0];
                const nodeHeight = this.size[1];
                this.setSize([nodeWidth * 1.5, nodeHeight * 1.1]);
                return result;
            };
        }
    },
});
