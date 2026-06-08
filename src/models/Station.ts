import { Schema, model, InferSchemaType, HydratedDocument } from 'mongoose';

const stationSchema = new Schema(
  {
    _id: { type: String, required: true }, // masalan "angren"
    nodeId: { type: String, required: true, ref: 'Node', index: true },
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    collection: 'stations',
  },
);

stationSchema.index({ nodeId: 1, name: 1 });

export type StationDoc = HydratedDocument<InferSchemaType<typeof stationSchema>>;
export const StationModel = model('Station', stationSchema);
