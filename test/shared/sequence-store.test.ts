import {describe, expect, it, vi} from "vitest";
import {PublisherSequenceStore} from "@/shared/sequence-store.js";

interface User {
    readonly id: number;
    readonly name: string;
}

describe("PublisherSequenceStore", () => {
    it("appends unkeyed values", () => {
        const store = new PublisherSequenceStore<number>();
        store.append(1);
        store.append(2);

        expect(store.getSnapshot().entries.map(entry => entry.value)).toEqual([1, 2]);
        expect(store.getSnapshot().entries[0]?.id).not.toBe(store.getSnapshot().entries[1]?.id);
    });

    it("updates a keyed entry without replacing its renderer identity", () => {
        const store = new PublisherSequenceStore<User>();
        const keyBy = (user: User): number => user.id;
        store.append({id: 1, name: "old"}, keyBy);
        const id = store.getSnapshot().entries[0]?.id;

        store.append({id: 1, name: "new"}, keyBy);

        expect(store.getSnapshot().entries).toEqual([
            {id, key: 1, value: {id: 1, name: "new"}, index: 0}
        ]);
    });

    it("reorders and deletes only when applying an authoritative snapshot", () => {
        const store = new PublisherSequenceStore<User>();
        const keyBy = (user: User): number => user.id;
        store.applySnapshot([
            {id: 1, name: "one"},
            {id: 2, name: "two"}
        ], keyBy);
        const secondId = store.getSnapshot().entries[1]?.id;

        store.applySnapshot([{id: 2, name: "updated"}], keyBy);

        expect(store.getSnapshot().entries).toEqual([
            {id: secondId, key: 2, value: {id: 2, name: "updated"}, index: 0}
        ]);
    });

    it("rejects duplicate snapshot keys without corrupting prior state", () => {
        const store = new PublisherSequenceStore<User>();
        const keyBy = (user: User): number => user.id;
        store.applySnapshot([{id: 1, name: "valid"}], keyBy);

        expect(() => store.applySnapshot([
            {id: 2, name: "a"},
            {id: 2, name: "b"}
        ], keyBy)).toThrow("Duplicate Publisher list key: 2");
        expect(store.getSnapshot().entries[0]?.value.name).toBe("valid");
    });

    it("notifies listeners and supports idempotent teardown", () => {
        const store = new PublisherSequenceStore<number>();
        const listener = vi.fn();
        const unsubscribe = store.subscribe(listener);
        store.append(1);
        unsubscribe();
        unsubscribe();
        store.append(2);

        expect(listener).toHaveBeenCalledTimes(1);
    });

    it("appends a burst with one notification", () => {
        const store = new PublisherSequenceStore<number>();
        const listener = vi.fn();
        store.subscribe(listener);

        store.appendMany(Array.from({length: 1_000}, (_value, index) => index));

        expect(store.getSnapshot().entries).toHaveLength(1_000);
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it("skips an equivalent primitive snapshot", () => {
        const store = new PublisherSequenceStore<number>();
        const listener = vi.fn();
        store.applySnapshot([1, 2]);
        store.subscribe(listener);

        store.applySnapshot([1, 2]);

        expect(listener).not.toHaveBeenCalled();
    });

    it("clears a failure when the next valid snapshot has equivalent values", () => {
        const store = new PublisherSequenceStore<number>();
        store.applySnapshot([1, 2]);
        store.fail(new TypeError("invalid snapshot"));

        store.applySnapshot([1, 2]);

        expect(store.getSnapshot().failure).toBeUndefined();
        expect(store.getSnapshot().entries.map(entry => entry.value)).toEqual([1, 2]);
    });

    it("rolls back keyed burst bookkeeping when a selector throws", () => {
        const store = new PublisherSequenceStore<User>();
        const keyBy = (user: User): number => {
            if (user.id < 0) {
                throw new TypeError("invalid key");
            }
            return user.id;
        };
        store.append({id: 1, name: "one"}, keyBy);

        expect(() => store.appendMany([
            {id: 2, name: "aborted"},
            {id: -1, name: "invalid"}
        ], keyBy)).toThrow("invalid key");
        store.append({id: 3, name: "three"}, keyBy);
        store.append({id: 2, name: "two"}, keyBy);

        expect(store.getSnapshot().entries.map(entry => entry.value.name))
            .toEqual(["one", "three", "two"]);
    });
});
