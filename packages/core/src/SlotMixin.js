/* eslint-disable class-methods-use-this */
import { dedupeMixin } from '@open-wc/dedupe-mixin';
import { render } from 'lit';
import { isTemplateResult } from 'lit/directive-helpers.js';

/**
 * @typedef {import('../types/SlotMixinTypes').SlotMixin} SlotMixin
 * @typedef {import('../types/SlotMixinTypes').SlotsMap} SlotsMap
 * @typedef {import('../index').LitElement} LitElement
 */

/**
 * @type {SlotMixin}
 * @param {import('@open-wc/dedupe-mixin').Constructor<LitElement>} superclass
 */
const SlotMixinImplementation = superclass =>
  class SlotMixin extends superclass {
    /**
     * @return {SlotsMap}
     */
    get slots() {
      return {};
    }

    constructor() {
      super();
      /** @private */
      this.__privateSlots = new Set(null);
    }

    connectedCallback() {
      super.connectedCallback();
      this._connectSlotMixin();
    }

    /**
     * @private
     * @param {import('@lion/core').TemplateResult} template
     */
    __renderAsNodes(template) {
      const tempRenderTarget = document.createElement('div');
      render(template, tempRenderTarget, this.renderOptions);
      return Array.from(tempRenderTarget.childNodes);
    }

    /**
     * @protected
     */
    _connectSlotMixin() {
      if (!this.__isConnectedSlotMixin) {
        Object.keys(this.slots).forEach(slotName => {
          if (!Array.from(this.children).find(el => el.slot === slotName)) {
            const slotContent = this.slots[slotName]();
            /** @type {Node[]} */
            let nodes = [];

            if (isTemplateResult(slotContent)) {
              nodes = this.__renderAsNodes(slotContent);
            } else if (!Array.isArray(slotContent)) {
              nodes = [/** @type {Node} */ (slotContent)];
            }

            nodes.forEach(node => {
              if (!(node instanceof Node)) {
                return;
              }
              if (node instanceof Element) {
                node.setAttribute('slot', slotName);
              }
              this.appendChild(node);
              this.__privateSlots.add(slotName);
            });
          }
        });
        this.__isConnectedSlotMixin = true;
      }
    }

    /**
     * @param {string} slotName Name of the slot
     * @return {boolean} true if given slot name been created by SlotMixin
     * @protected
     */
    _isPrivateSlot(slotName) {
      return this.__privateSlots.has(slotName);
    }
  };

export const SlotMixin = dedupeMixin(SlotMixinImplementation);
