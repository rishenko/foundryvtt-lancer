import { template_action_tracking, template_statuses, template_universal_actor } from "./shared";

import { FakeBoundedNumberField, LancerDataModel, LIDField, EmbeddedRefField, SyncUUIDRefField } from "../shared";
import { EntryType } from "../../enums";
import { regRefToUuid } from "../../migration";

const fields: any = foundry.data.fields;

const pilot_schema = {
  active_mech: new SyncUUIDRefField({ allowed_types: [EntryType.MECH] }),
  background: new fields.HTMLField(),
  callsign: new fields.StringField(),
  cloud_id: new fields.StringField(),
  history: new fields.HTMLField(),
  last_cloud_update: new fields.StringField(),
  level: new fields.NumberField({ min: 0, max: 12, integer: true }),

  loadout: new fields.SchemaField({
    armor: new fields.ArrayField(new EmbeddedRefField("Item", { allowed_types: [EntryType.PILOT_ARMOR] })),
    gear: new fields.ArrayField(new EmbeddedRefField("Item", { allowed_types: [EntryType.PILOT_GEAR] })),
    weapons: new fields.ArrayField(new EmbeddedRefField("Item", { allowed_types: [EntryType.PILOT_WEAPON] })),
  }),

  hull: new fields.NumberField({ min: 0, max: 6, integer: true }),
  agi: new fields.NumberField({ min: 0, max: 6, integer: true }),
  sys: new fields.NumberField({ min: 0, max: 6, integer: true }),
  eng: new fields.NumberField({ min: 0, max: 6, integer: true }),

  mounted: new fields.BooleanField(),
  notes: new fields.HTMLField(),
  player_name: new fields.StringField(),
  status: new fields.StringField(),
  text_appearance: new fields.HTMLField(),

  ...template_universal_actor(),
  ...template_action_tracking(),
  ...template_statuses(),
};

type PilotSchema = typeof pilot_schema;

export class PilotModel extends LancerDataModel<"PilotModel"> {
  static defineSchema(): PilotSchema {
    return pilot_schema;
  }

  static migrateData(data: any) {
    // Convert old regrefs
    if (typeof data.pilot == "object") {
      data.active_mech = regRefToUuid("Actor", data.active_mech);
    }

    // @ts-expect-error v11
    return super.migrateData(data);
  }
}
