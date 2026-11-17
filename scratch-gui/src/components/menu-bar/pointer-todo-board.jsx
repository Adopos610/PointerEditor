import PropTypes from 'prop-types';
import React from 'react';

import {getAccount} from '../../lib/pointer-account';
import styles from './pointer-todo-board.css';

const STORAGE_KEY = 'pointere.project.todos.v1';
const MAX_TODOS = 50;
const MAX_TEXT = 140;

const makeId = () => `todo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

const normalize = value => {
    if (!Array.isArray(value)) return [];
    return value.slice(0, MAX_TODOS).map((item, index) => {
        const text = String(item && item.text || '').trim().slice(0, MAX_TEXT);
        if (!text) return null;
        return {
            id: String(item.id || `todo_${index}`).slice(0, 40),
            text,
            done: Boolean(item.done),
            author: String(item.author || '').slice(0, 24),
            createdAt: Number(item.createdAt) || Date.now()
        };
    }).filter(Boolean);
};

const loadLocal = () => {
    try {
        return normalize(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'));
    } catch (error) {
        return [];
    }
};

const saveLocal = todos => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(normalize(todos)));
    } catch (error) {
        // Keep the board usable if storage is unavailable.
    }
};

class PointerTodoBoard extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            todos: loadLocal(),
            input: '',
            syncRoom: '',
            isHost: false
        };
        this.handleAdd = this.handleAdd.bind(this);
        this.handleToggle = this.handleToggle.bind(this);
        this.handleDelete = this.handleDelete.bind(this);
        this.handleClearDone = this.handleClearDone.bind(this);
        this.handleJoined = this.handleJoined.bind(this);
        this.handleRemote = this.handleRemote.bind(this);
        this.handleClosed = this.handleClosed.bind(this);
    }

    componentDidMount () {
        this.mounted = true;
        window.addEventListener('pointere-collab-joined', this.handleJoined);
        window.addEventListener('pointere-collab-todos', this.handleRemote);
        window.addEventListener('pointere-collab-closed', this.handleClosed);
    }

    componentWillUnmount () {
        this.mounted = false;
        clearTimeout(this.seedTimer);
        window.removeEventListener('pointere-collab-joined', this.handleJoined);
        window.removeEventListener('pointere-collab-todos', this.handleRemote);
        window.removeEventListener('pointere-collab-closed', this.handleClosed);
    }

    getAuthor () {
        const account = getAccount();
        const user = account && account.user;
        return user ? String(user.nickname || user.username || '').slice(0, 24) : '本地作者';
    }

    publish (next) {
        saveLocal(next);
        this.setState({todos: next});
        if (this.state.syncRoom) {
            window.dispatchEvent(new CustomEvent('pointere-collab-todo-publish', {
                detail: {todos: next}
            }));
        }
    }

    handleJoined (event) {
        const detail = event.detail || {};
        const isHost = Boolean(detail.isHost);
        this.isHostNow = isHost;
        this.awaitingInitialTodo = true;
        this.setState({syncRoom: detail.room || '', isHost});
        clearTimeout(this.seedTimer);
        this.seedTimer = setTimeout(() => {
            if (!this.mounted || !this.state.syncRoom || !this.awaitingInitialTodo) return;
            this.awaitingInitialTodo = false;
            if (this.isHostNow && this.state.todos.length) {
                window.dispatchEvent(new CustomEvent('pointere-collab-todo-publish', {
                    detail: {todos: this.state.todos}
                }));
            }
        }, 1200);
    }

    handleRemote (event) {
        const todos = normalize(event.detail && event.detail.todos);
        const initial = this.awaitingInitialTodo;
        this.awaitingInitialTodo = false;
        clearTimeout(this.seedTimer);
        if (initial && this.isHostNow && todos.length === 0 && this.state.todos.length) {
            window.dispatchEvent(new CustomEvent('pointere-collab-todo-publish', {
                detail: {todos: this.state.todos}
            }));
            return;
        }
        saveLocal(todos);
        this.setState({todos});
    }

    handleClosed () {
        clearTimeout(this.seedTimer);
        this.awaitingInitialTodo = false;
        this.isHostNow = false;
        this.setState({syncRoom: '', isHost: false});
    }

    handleAdd (event) {
        event.preventDefault();
        const text = this.state.input.trim();
        if (!text) return;
        const todo = {
            id: makeId(),
            text: text.slice(0, MAX_TEXT),
            done: false,
            author: this.getAuthor(),
            createdAt: Date.now()
        };
        this.publish([todo, ...this.state.todos].slice(0, MAX_TODOS));
        this.setState({input: ''});
    }

    handleToggle (id) {
        this.publish(this.state.todos.map(todo => (
            todo.id === id ? {...todo, done: !todo.done} : todo
        )));
    }

    handleDelete (id) {
        this.publish(this.state.todos.filter(todo => todo.id !== id));
    }

    handleClearDone () {
        if (!this.state.todos.some(todo => todo.done)) return;
        this.publish(this.state.todos.filter(todo => !todo.done));
    }

    render () {
        const {todos, input, syncRoom, isHost} = this.state;
        const done = todos.filter(todo => todo.done).length;
        return (
            <section className={styles.board} role="dialog" aria-label="项目 TODO">
                <header className={styles.header}>
                    <div>
                        <span className={styles.kicker}>PROJECT TODO</span>
                        <h2>项目清单</h2>
                    </div>
                    <button type="button" className={styles.close} onClick={this.props.onClose} aria-label="关闭">×</button>
                </header>
                <div className={styles.status}>
                    <span className={syncRoom ? styles.syncLive : styles.syncLocal}>
                        {syncRoom ? `协作中 · ${syncRoom}${isHost ? ' · 房主' : ''}` : '本地保存'}
                    </span>
                    <span>{done}/{todos.length} 完成</span>
                </div>
                <form className={styles.addRow} onSubmit={this.handleAdd}>
                    <input
                        value={input}
                        onChange={event => this.setState({input: event.target.value})}
                        placeholder="添加一条 TODO，回车创建"
                        maxLength={MAX_TEXT}
                        aria-label="添加 TODO"
                    />
                    <button type="submit" className={styles.addButton} disabled={!input.trim()}>+</button>
                </form>
                <div className={styles.list}>
                    {todos.length ? todos.map(todo => (
                        <div key={todo.id} className={styles.item}>
                            <button
                                type="button"
                                className={todo.done ? styles.checkDone : styles.check}
                                onClick={() => this.handleToggle(todo.id)}
                                aria-label={todo.done ? '标记未完成' : '标记完成'}
                            >
                                {todo.done ? '✓' : ''}
                            </button>
                            <div className={styles.itemBody}>
                                <span className={todo.done ? styles.textDone : styles.text}>{todo.text}</span>
                                <small>{todo.author || '协作者'}</small>
                            </div>
                            <button
                                type="button"
                                className={styles.delete}
                                onClick={() => this.handleDelete(todo.id)}
                                aria-label="删除 TODO"
                            >
                                ×
                            </button>
                        </div>
                    )) : (
                        <div className={styles.empty}>
                            <strong>还没有待办</strong>
                            <span>把下一步写下来，协作的人都能看到。</span>
                        </div>
                    )}
                </div>
                <footer className={styles.footer}>
                    <button type="button" className={styles.linkButton} onClick={this.handleClearDone}>清除已完成</button>
                    <span>所有协作者均可编辑</span>
                </footer>
            </section>
        );
    }
}

PointerTodoBoard.propTypes = {
    onClose: PropTypes.func.isRequired
};

export default PointerTodoBoard;
