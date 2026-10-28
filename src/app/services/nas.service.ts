import { Injectable } from '@angular/core';

/*
 * File System Access API（Chrome / Edge）の型。TypeScript の標準の型定義に無い部分だけを宣言する。
 * https://developer.mozilla.org/docs/Web/API/File_System_API
 */
type PermissionMode = { mode: 'read' | 'readwrite' };
interface FsDirHandle extends FileSystemDirectoryHandle {
  queryPermission(desc: PermissionMode): Promise<PermissionState>;
  requestPermission(desc: PermissionMode): Promise<PermissionState>;
  values(): AsyncIterableIterator<FileSystemDirectoryHandle | FileSystemFileHandle>;
}
declare global {
  interface Window {
    showDirectoryPicker?(options?: { id?: string; mode?: 'read' | 'readwrite'; startIn?: string }): Promise<FileSystemDirectoryHandle>;
  }
}

const DB_NAME = 'mwsys-nas';
const STORE = 'handles';

/**
 * LAN（VPN 含む）内の NAS などのフォルダへ、ブラウザから直接ファイルを保存する。
 * File System Access API を使うため Chrome / Edge のみ（https または localhost）。
 *   ・用途（key。例: 'ship' = 出荷）ごとに、各 PC で最初に一度フォルダを選ぶ。選んだフォルダはブラウザ内（IndexedDB）に記憶する
 *   ・書き込みの許可はブラウザを開き直すと消えるので、作業のたびに「編集を許可」を求める（ボタンを押した処理の中で呼ぶこと）
 */
@Injectable({
  providedIn: 'root'
})
export class NasService {

  /** このブラウザでフォルダへの保存が使えるか */
  get supported(): boolean {
    return typeof window.showDirectoryPicker === 'function';
  }

  /** フォルダを選んで、用途 key のフォルダとして記憶する。キャンセルしたときは undefined */
  async pick(key: string): Promise<FileSystemDirectoryHandle | undefined> {
    if (!this.supported) {
      throw new Error('このブラウザはフォルダへの保存に対応していません（Chrome または Edge を使ってください）');
    }
    try {
      const dir = await window.showDirectoryPicker!({ id: 'mwsys-' + key, mode: 'readwrite' });
      await this.idb('readwrite', s => s.put(dir, key));
      return dir;
    } catch (e) {
      if ((e as DOMException)?.name == 'AbortError') {
        return undefined;
      }
      throw e;
    }
  }

  /** 用途 key のフォルダとして記憶しているフォルダ（未設定は undefined） */
  async get(key: string): Promise<FileSystemDirectoryHandle | undefined> {
    return await this.idb<FileSystemDirectoryHandle | undefined>('readonly', s => s.get(key));
  }

  /**
   * 用途 key のフォルダを、書き込みできる状態で返す。
   * 許可が無ければ「編集を許可」を求める（ボタンを押した処理の中で呼ぶこと。ブラウザの制限で、操作の直後でないと聞けない）。
   * 未設定・許可されなかったときは理由つきのエラー。
   */
  async open(key: string): Promise<FileSystemDirectoryHandle> {
    const dir = await this.get(key) as FsDirHandle | undefined;
    if (!dir) {
      throw new Error('保存先のフォルダが設定されていません（設定メニューの「出荷フォルダ（NAS）の設定」で選んでください）');
    }
    const mode: PermissionMode = { mode: 'readwrite' };
    if (await dir.queryPermission(mode) != 'granted' && await dir.requestPermission(mode) != 'granted') {
      throw new Error('保存先のフォルダ「' + dir.name + '」への書き込みが許可されませんでした');
    }
    return dir;
  }

  /** dir の下の path（'/' 区切り）のフォルダを返す。無ければ作る */
  async folder(dir: FileSystemDirectoryHandle, path: string): Promise<FileSystemDirectoryHandle> {
    let cur = dir;
    for (const name of path.split('/').filter(e => e)) {
      cur = await cur.getDirectoryHandle(this.safeName(name), { create: true });
    }
    return cur;
  }

  /** dir の下の path（'/' 区切り）のフォルダを返す。無ければ undefined（作らない） */
  async find(dir: FileSystemDirectoryHandle, path: string): Promise<FileSystemDirectoryHandle | undefined> {
    let cur = dir;
    try {
      for (const name of path.split('/').filter(e => e)) {
        cur = await cur.getDirectoryHandle(this.safeName(name));
      }
      return cur;
    } catch (e) {
      if ((e as DOMException)?.name == 'NotFoundError' || (e as DOMException)?.name == 'TypeMismatchError') {
        return undefined;
      }
      throw e;
    }
  }

  /** フォルダ dir の中のフォルダ（kind = 'directory'）またはファイルの名前の一覧 */
  async names(dir: FileSystemDirectoryHandle, kind: FileSystemHandleKind): Promise<string[]> {
    const ret: string[] = [];
    for await (const h of (dir as FsDirHandle).values()) {
      if (h.kind == kind) {
        ret.push(h.name);
      }
    }
    return ret.sort();
  }

  /** フォルダ dir にファイルを書く（同じ名前があれば上書き） */
  async write(dir: FileSystemDirectoryHandle, fileName: string, data: Blob | string): Promise<void> {
    const file = await dir.getFileHandle(this.safeName(fileName), { create: true });
    const w = await file.createWritable();
    try {
      await w.write(data);
    } finally {
      await w.close();
    }
  }

  /** フォルダ dir のファイルを読む（無ければ undefined） */
  async read(dir: FileSystemDirectoryHandle, fileName: string): Promise<File | undefined> {
    try {
      return await (await dir.getFileHandle(this.safeName(fileName))).getFile();
    } catch {
      return undefined;
    }
  }

  /** フォルダ dir のファイル（またはフォルダ）を削除する。無ければ何もしない */
  async remove(dir: FileSystemDirectoryHandle, name: string, recursive = false): Promise<void> {
    try {
      await dir.removeEntry(this.safeName(name), { recursive: recursive });
    } catch (e) {
      if ((e as DOMException)?.name != 'NotFoundError') {
        throw e;
      }
    }
  }

  /** ファイル名・フォルダ名に使えない文字を全角に置き換える */
  safeName(name: string): string {
    return name.replace(/[\\/:*?"<>|]/g, c => String.fromCharCode(c.charCodeAt(0) + 0xFEE0)).trim();
  }

  /** フォルダの記憶（IndexedDB） */
  private idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
    return new Promise((resolve, reject) => {
      const open = indexedDB.open(DB_NAME, 1);
      open.onupgradeneeded = () => open.result.createObjectStore(STORE);
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const req = fn(db.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => { resolve(req.result as T); db.close(); };
        req.onerror = () => { reject(req.error); db.close(); };
      };
    });
  }
}
