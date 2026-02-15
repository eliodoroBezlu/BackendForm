import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document, Types } from 'mongoose';
import { Role } from '../enums/role.enum';

@Schema({ timestamps: true })
export class User extends Document {

  _id: Types.ObjectId;
  @Prop({ 
    required: true, 
    unique: true, 
    lowercase: true, 
    trim: true,
    minlength: 3,
    maxlength: 30,
    match: /^[a-zA-Z0-9_-]+$/
  })
  username: string;

  @Prop({ 
    required: false, 
    unique: true, 
    sparse: true, // Permite nulls únicos
    lowercase: true, 
    trim: true 
  })
  email?: string;

  @Prop({ required: true })
  password: string;

  @Prop({ 
    type: [String], 
    enum: Role,
    default: [Role.USER] 
  })
  roles: Role[];

  @Prop({ default: false })
  isTwoFactorEnabled: boolean;

@Prop({ type: mongoose.Schema.Types.Mixed })
twoFactorSecret: string | null;


  @Prop({ type: [String], default: [] })
  backupCodes: string[];

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: null })
  fullName?: string;

  @Prop({ default: null })
  avatarUrl?: string;

  createdAt: Date;
  updatedAt: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

// Índices
UserSchema.index({ username: 1 });
UserSchema.index({ email: 1 }, { sparse: true });