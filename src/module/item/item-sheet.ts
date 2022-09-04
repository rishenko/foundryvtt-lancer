import type { LancerItemSheetData } from "../interfaces";
import { LANCER } from "../config";
import type { LancerItem, LancerItemType } from "./lancer-item";
import {
  HANDLER_activate_general_controls,
  HANDLER_activate_popout_text_editor,
  resolve_dotpath
} from "../helpers/commons";
import { HANDLER_activate_counter_listeners, HANDLER_activate_plus_minus_buttons } from "../helpers/item";
import {
  HANDLER_activate_native_ref_dragging,
  HANDLER_activate_ref_dragging,
  HANDLER_activate_ref_drop_clearing,
  HANDLER_activate_ref_drop_setting,
  HANDLER_add_ref_to_list_on_drop,
  HANDLER_activate_ref_clicking,
  HANDLER_activate_uses_editor,
} from "../helpers/refs";
import { OpCtx, Counter, RegEntry } from "machine-mind";
import {
  HANDLER_activate_edit_bonus,
  HANDLER_activate_item_context_menus,
  HANDLER_activate_profile_context_menus,
} from "../helpers/item";
import { HANDLER_activate_tag_context_menus, HANDLER_activate_tag_dropping } from "../helpers/tags";
import { CollapseHandler } from "../helpers/collapse";
import { activate_action_editor } from "../apps/action-editor";
import { find_license_for } from "../util/doc";
import { dragResolverCache } from "../helpers/dragdrop";

const lp = LANCER.log_prefix;

/**
 * Extend the basic ItemSheet with some very simple modifications
 * @extends {ItemSheet}
 */
export class LancerItemSheet<T extends LancerItemType> extends ItemSheet<ItemSheet.Options, LancerItemSheetData<T>> {
  constructor(document: LancerItem, options: ItemSheet.Options) {
    super(document, options);
    if (this.item.is_mech_weapon()) {
      // @ts-ignore IDK if this even does anything
      // TODO Figure out if this even does anything
      this.options.initial = `profile${this.item.data.data.selected_profile || 0}`;
    }
  }

  // Tracks collapse state between renders
  protected collapse_handler = new CollapseHandler();

  /**
   * @override
   * Extend and override the default options used by the Item Sheet
   */
  static get defaultOptions(): ItemSheet.Options {
    return mergeObject(super.defaultOptions, {
      classes: ["lancer", "sheet", "item"],
      width: 700,
      height: 700,
      tabs: [
        {
          navSelector: ".lancer-tabs",
          contentSelector: ".sheet-body",
          initial: "description",
        },
      ],
    });
  }

  /** @override */
  get template() {
    const path = `systems/${game.system.id}/templates/item`;
    return `${path}/${this.item.data.type}.hbs`;
  }

  /* -------------------------------------------- */

  /**
   * Private helper that applies context menus according to the editability of the sheet.
   * @param html {JQuery}    The prepared HTML object ready to be rendered into the DOM
   * @param data_getter      Reference to a function which can provide the sheet data
   * @param commit_func      Reference to a function which can commit/save data back to the document
   */
  _activate_context_listeners(
    html: JQuery,
    // Retrieves the data that we will operate on
    data_getter: () => Promise<LancerItemSheetData<T>> | LancerItemSheetData<T>,
    commit_func: (data: LancerItemSheetData<T>) => void | Promise<void>
  ) {
    // Enable custom context menu triggers. If the sheet is not editable, show only the "view" option.
    HANDLER_activate_item_context_menus(html, data_getter, commit_func, !this.options.editable);
  }

  /**
   * @override
   * Activate event listeners using the prepared sheet HTML
   * @param html {JQuery}   The prepared HTML object ready to be rendered into the DOM
   */
  activateListeners(html: JQuery) {
    super.activateListeners(html);

    let getfunc = () => this.getData();
    let commitfunc = (_: any) => this._commitCurrMM();

    // Make refs clickable
    $(html).find(".ref.valid.clickable-ref:not(.profile-img)").on("click", HANDLER_activate_ref_clicking);

    // Enable ref dragging
    HANDLER_activate_ref_dragging(html);
    HANDLER_activate_native_ref_dragging(html);

    this._activate_context_listeners(html, getfunc, commitfunc);

    // Everything below here is only needed if the sheet is editable
    if (!this.options.editable) {
      return;
    }

    // Make +/- buttons work
    HANDLER_activate_plus_minus_buttons(html, getfunc, () => this.submit({}));

    // Make counter pips work
    HANDLER_activate_counter_listeners(html, getfunc);

    // Grab pre-existing ctx if available
    let resolver = new dragResolverCache();

    // Enable hex use triggers.
    HANDLER_activate_uses_editor(html, getfunc);

    // Allow dragging items into lists
    HANDLER_add_ref_to_list_on_drop(resolver, html, getfunc, commitfunc);

    // Allow set things by drop. Mostly we use this for manufacturer/license dragging
    HANDLER_activate_ref_drop_setting(resolver, html, null, null, getfunc, commitfunc); // Don't restrict what can be dropped past type, and don't take ownership or whatever
    HANDLER_activate_ref_drop_clearing(html, getfunc, commitfunc);

    // Enable bonus editors
    HANDLER_activate_edit_bonus(html, getfunc, commitfunc);

    // Enable tag editing
    HANDLER_activate_tag_context_menus(html, getfunc, commitfunc);

    // Enable profile editing
    HANDLER_activate_profile_context_menus(html, getfunc, commitfunc);

    // Enable popout editors
    HANDLER_activate_popout_text_editor(html, getfunc, commitfunc);

    // Enable general controls, so items can be deleted and such
    HANDLER_activate_general_controls(html, getfunc, commitfunc);

    // Enable tag dropping
    HANDLER_activate_tag_dropping(resolver, html, getfunc, commitfunc);

    // Enable action editors
    activate_action_editor(html, getfunc, commitfunc);
  }

  /* -------------------------------------------- */

  _propagateMMData(formData: any): any {
    // Pushes relevant field data from the form to other appropriate locations,
    // (presently there aren't any but uhhh could be i guess. Just here to mirror actor-sheet)
    // Get the basics
    let new_top: any = {
      img: formData.img,
      name: formData.name,
    };

    return new_top;
  }
  /**
   * Implement the _updateObject method as required by the parent class spec
   * This defines how to update the subject of the form when the form is submitted
   * @private
   */
  async _updateObject(_event: Event | JQuery.Event, formData: any): Promise<any> {
    // Simple writeback
    await this.item.update(formData);
  }

  /**
   * Prepare data for rendering the frame sheet
   * The prepared data object contains both the actor data as well as additional sheet options
   */
  async getData(): Promise<LancerItemSheetData<T>> {
    const data = super.getData() as LancerItemSheetData<T>; // Not fully populated yet!

    // Wait for preparations to complete
    let tmp_dat = this.item.data;

    // Additionally we would like to find a matching license. Re-use ctx, try both a world and global reg, actor as well if it exists
    data.license = null;
    if (this.actor?.is_pilot() || this.actor?.is_mech()) {
      data.license = await find_license_for(data.mm, this.actor!);
    } else {
      data.license = await find_license_for(data.mm);
    }

    console.log(`${lp} Rendering with following item ctx: `, data);
    this._currData = data;
    return data;
  }

  // Get the ctx that our actor + its items reside in. If an unowned item we'll just yield null
  getCtx(): OpCtx | null {
    let ctx = this.item.data.data.derived.mm?.OpCtx;
    return ctx ?? null;
  }
}
