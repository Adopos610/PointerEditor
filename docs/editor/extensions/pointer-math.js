// Name: Pointer 数学工具
// ID: pointerMath
// Description: 映射、限制、取整、百分比与千分位格式化等常用数学积木。
// By: PointerEditor
// License: GPL-3.0-only

(function (Scratch) {
    'use strict';

    const numberOrZero = value => {
        const number = Number(value);
        return Number.isFinite(number) ? number : 0;
    };

    class PointerMath {
        getInfo () {
            return {
                id: 'pointerMath',
                name: 'Pointer 数学工具',
                color1: '#7C5CFF',
                color2: '#5B3FD1',
                blocks: [
                    {
                        opcode: 'clamp',
                        blockType: Scratch.BlockType.REPORTER,
                        text: '把 [VALUE] 限制在 [MIN] 到 [MAX] 之间',
                        arguments: {
                            VALUE: {type: Scratch.ArgumentType.NUMBER, defaultValue: 12},
                            MIN: {type: Scratch.ArgumentType.NUMBER, defaultValue: 0},
                            MAX: {type: Scratch.ArgumentType.NUMBER, defaultValue: 10}
                        }
                    },
                    {
                        opcode: 'map',
                        blockType: Scratch.BlockType.REPORTER,
                        text: '把 [VALUE] 从 [A]–[B] 映射到 [C]–[D]',
                        arguments: {
                            VALUE: {type: Scratch.ArgumentType.NUMBER, defaultValue: 5},
                            A: {type: Scratch.ArgumentType.NUMBER, defaultValue: 0},
                            B: {type: Scratch.ArgumentType.NUMBER, defaultValue: 10},
                            C: {type: Scratch.ArgumentType.NUMBER, defaultValue: 0},
                            D: {type: Scratch.ArgumentType.NUMBER, defaultValue: 100}
                        }
                    },
                    {
                        opcode: 'roundTo',
                        blockType: Scratch.BlockType.REPORTER,
                        text: '把 [VALUE] 四舍五入保留 [DIGITS] 位小数',
                        arguments: {
                            VALUE: {type: Scratch.ArgumentType.NUMBER, defaultValue: 3.14159},
                            DIGITS: {type: Scratch.ArgumentType.NUMBER, defaultValue: 2}
                        }
                    },
                    {
                        opcode: 'percent',
                        blockType: Scratch.BlockType.REPORTER,
                        text: '[PART] 占 [TOTAL] 的百分比',
                        arguments: {
                            PART: {type: Scratch.ArgumentType.NUMBER, defaultValue: 25},
                            TOTAL: {type: Scratch.ArgumentType.NUMBER, defaultValue: 200}
                        }
                    },
                    {
                        opcode: 'randomInteger',
                        blockType: Scratch.BlockType.REPORTER,
                        text: '随机整数 [MIN] 到 [MAX]',
                        arguments: {
                            MIN: {type: Scratch.ArgumentType.NUMBER, defaultValue: 1},
                            MAX: {type: Scratch.ArgumentType.NUMBER, defaultValue: 100}
                        }
                    },
                    {
                        opcode: 'randomDecimal',
                        blockType: Scratch.BlockType.REPORTER,
                        text: '随机小数 [MIN] 到 [MAX]',
                        arguments: {
                            MIN: {type: Scratch.ArgumentType.NUMBER, defaultValue: 0},
                            MAX: {type: Scratch.ArgumentType.NUMBER, defaultValue: 1}
                        }
                    },
                    {
                        opcode: 'formatNumber',
                        blockType: Scratch.BlockType.REPORTER,
                        text: '把 [VALUE] 格式化为千分位',
                        arguments: {
                            VALUE: {type: Scratch.ArgumentType.NUMBER, defaultValue: 1234567.89}
                        }
                    },
                    {
                        opcode: 'isEven',
                        blockType: Scratch.BlockType.BOOLEAN,
                        text: '[VALUE] 是偶数？',
                        arguments: {
                            VALUE: {type: Scratch.ArgumentType.NUMBER, defaultValue: 4}
                        }
                    }
                ]
            };
        }

        clamp (args) {
            const value = numberOrZero(args.VALUE);
            const min = numberOrZero(args.MIN);
            const max = numberOrZero(args.MAX);
            return Math.min(Math.max(value, Math.min(min, max)), Math.max(min, max));
        }

        map (args) {
            const value = numberOrZero(args.VALUE);
            const fromA = numberOrZero(args.A);
            const fromB = numberOrZero(args.B);
            const toA = numberOrZero(args.C);
            const toB = numberOrZero(args.D);
            if (fromA === fromB) return toA;
            return toA + ((value - fromA) / (fromB - fromA)) * (toB - toA);
        }

        roundTo (args) {
            const digits = Math.max(0, Math.min(10, Math.floor(numberOrZero(args.DIGITS))));
            const factor = Math.pow(10, digits);
            return Math.round(numberOrZero(args.VALUE) * factor) / factor;
        }

        percent (args) {
            const total = numberOrZero(args.TOTAL);
            if (total === 0) return 0;
            return (numberOrZero(args.PART) / total) * 100;
        }

        randomInteger (args) {
            const min = Math.ceil(numberOrZero(args.MIN));
            const max = Math.floor(numberOrZero(args.MAX));
            if (min > max) return min;
            return Math.floor(Math.random() * (max - min + 1)) + min;
        }

        randomDecimal (args) {
            const min = numberOrZero(args.MIN);
            const max = numberOrZero(args.MAX);
            if (min === max) return min;
            const low = Math.min(min, max);
            const high = Math.max(min, max);
            return low + Math.random() * (high - low);
        }

        formatNumber (args) {
            return new Intl.NumberFormat('zh-CN', {maximumFractionDigits: 6})
                .format(numberOrZero(args.VALUE));
        }

        isEven (args) {
            return numberOrZero(args.VALUE) % 2 === 0;
        }
    }

    Scratch.extensions.register(new PointerMath());
})(Scratch);
