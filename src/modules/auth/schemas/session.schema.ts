// session.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true }) // ← Agrega createdAt y updatedAt automáticamente
export class Session extends Document {

  
  _id: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  refreshTokenHash: string;

  @Prop({ required: true })
  userAgent: string;

  @Prop({ required: true })
  ip: string;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ default: false })
  isRevoked: boolean;

  @Prop({ default: null })
  lastRefreshedAt: Date; // ← NUEVO campo

  @Prop({ default: null })
  deviceFingerprint?: string; // ← OPCIONAL: para identificar dispositivo único
}

export const SessionSchema = SchemaFactory.createForClass(Session);

// Índices
SessionSchema.index({ userId: 1 });
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL automático
SessionSchema.index({ refreshTokenHash: 1 });
SessionSchema.index({ isRevoked: 1, updatedAt: 1 }); // Para limpieza