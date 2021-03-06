import * as types from '../mutation-types';
import { User, PlayList } from 'util/models';

const state = {
    loginValid: false,
    playlist: [],
    info: new User()
};

const mutations = {
    [types.SET_LOGIN_VALID](state, payload) {
        if (payload === undefined || payload === true || payload.valid === true) {
            state.loginValid = true;
        } else {
            state.loginValid = false;
        }
    },
    [types.SET_USER_INFO](state, payload) {
        state.info = new User(payload);
    },
    [types.UPDATE_USER_INFO](state, payload) {
        Object.assign(state.info, new User(payload));
    },
    [types.SET_USER_PLAYLISTS](state, payload) {
        state.playlist = payload.map(l => new PlayList(l));
    },
    [types.UPDATE_USER_PLAYLIST](state, payload) {
        const target = state.playlist.filter(l => l.id === payload.id).pop();
        if (target) {
            let newList = new PlayList(payload);
            for (const key in newList) {
                if (typeof newList[key] === typeof undefined) {
                    delete newList[key];
                }
            }
            Object.assign(target, newList);
        }
    }
};

export default {
    state,
    mutations
};
