import { customAlphabet } from 'nanoid';

const alnum = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ', 24);

/** 'ag_' + 24 random chars. */
export const newAgentToken = () => 'ag_' + alnum();

export const isAgentToken = (t: string) => /^ag_[0-9A-Za-z]{24}$/.test(t);
