import React, { createContext } from 'react';
import  { io }  from 'socket.io-client';

export const socket = io(`//{{ rtc_server }}`);