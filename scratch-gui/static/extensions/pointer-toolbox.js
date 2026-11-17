// Name: Pointer 工具箱
// ID: pointerToolbox
// Description: 项目统计、日期时间与文本小工具。
// By: PointerEditor
// License: GPL-3.0-only

(function (Scratch) {
    'use strict';

    const STARTED_AT = Date.now();
    const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    const pad = value => String(value).padStart(2, '0');

    class PointerToolbox {
        constructor () {
            this.startedAt = STARTED_AT;
        }
        getInfo () {
            return {
                id: 'pointerToolbox',
                name: 'Pointer 工具箱',
                color1: '#2F6FE4',
                color2: '#2258B8',
                blocks: [
                    {
                        opcode: 'currentDate',
                        blockType: Scratch.BlockType.REPORTER,
                        text: '当前日期'
                    },
                    {
                        opcode: 'currentTime',
                        blockType: Scratch.BlockType.REPORTER,
                        text: '当前时间'
                    },
                    {
                        opcode: 'currentWeekday',
                        blockType: Scratch.BlockType.REPORTER,
                        text: '当前星期'
                    },
                    {
                        opcode: 'timestamp',
                        blockType: Scratch.BlockType.REPORTER,
                        text: '当前时间戳'
                    },
                    {
                        opcode: 'runningSeconds',
                        blockType: Scratch.BlockType.REPORTER,
                        text: '扩展运行秒数'
                    },
                    {
                        opcode: 'resetRunningSeconds',
                        blockType: Scratch.BlockType.COMMAND,
                        text: '重置扩展运行计时'
                    },
                    {
                        opcode: 'uuid',
                        blockType: Scratch.BlockType.REPORTER,
                        text: '随机 UUID'
                    },
                    {
                        opcode: 'textLength',
                        blockType: Scratch.BlockType.REPORTER,
                        text: '文本 [TEXT] 的长度',
                        arguments: {
                            TEXT: {type: Scratch.ArgumentType.STRING, defaultValue: 'Hello'}
                        }
                    },
                    {
                        opcode: 'reverseText',
                        blockType: Scratch.BlockType.REPORTER,
                        text: '反转文本 [TEXT]',
                        arguments: {
                            TEXT: {type: Scratch.ArgumentType.STRING, defaultValue: 'abc'}
                        }
                    },
                    {
                        opcode: 'replaceText',
                        blockType: Scratch.BlockType.REPORTER,
                        text: '把 [TEXT] 中的 [FROM] 替换为 [TO]',
                        arguments: {
                            TEXT: {type: Scratch.ArgumentType.STRING, defaultValue: 'apple'},
                            FROM: {type: Scratch.ArgumentType.STRING, defaultValue: 'p'},
                            TO: {type: Scratch.ArgumentType.STRING, defaultValue: 'P'}
                        }
                    }
                ]
            };
        }

        currentDate () {
            const now = new Date();
            return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
        }

        currentTime () {
            const now = new Date();
            return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
        }

        currentWeekday () {
            return WEEKDAYS[new Date().getDay()];
        }

        timestamp () {
            return Date.now();
        }

        runningSeconds () {
            return Math.floor((Date.now() - this.startedAt) / 1000);
        }

        resetRunningSeconds () {
            this.startedAt = Date.now();
        }

        uuid () {
            if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
                return crypto.randomUUID();
            }
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, character => {
                const random = Math.floor(Math.random() * 16);
                const value = character === 'x' ? random : ((random & 0x3) | 0x8);
                return value.toString(16);
            });
        }

        textLength (args) {
            return Array.from(String(args.TEXT)).length;
        }

        reverseText (args) {
            return Array.from(String(args.TEXT)).reverse().join('');
        }

        replaceText (args) {
            return String(args.TEXT).split(String(args.FROM)).join(String(args.TO));
        }
    }

    Scratch.extensions.register(new PointerToolbox());
})(Scratch);
