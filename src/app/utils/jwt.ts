import jwt from "jsonwebtoken";


export const generateToken = (
  payload: object,
  secret: string,
  expiresIn: string | number
): string => {
  return jwt.sign(payload, secret, {
    expiresIn: expiresIn,
  } as any);
};

export const verifyToken = (token: string, secret: string) => {
  return jwt.verify(token, secret) ;
};
