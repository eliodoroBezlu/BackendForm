import { Request } from 'express';
import { User } from 'src/modules/auth/schemas/user.schema';

export interface RequestWithUser extends Request {
  user: User;
}