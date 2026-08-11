import { describe, expect, it } from "vitest";

import {
  clearFavoritesForTest,
  createFavorite,
  deleteFavorite,
  listFavorites,
} from "@/lib/history/favorites";

describe("favorites", () => {
  it("creates lists and deletes favorites", async () => {
    clearFavoritesForTest();

    const created = await createFavorite({
      userId: "u1",
      label: "车源总数",
      prompt: "大风车正式车源一共有多少辆？",
    });

    expect(created.id).toBeTruthy();

    const listed = await listFavorites("u1");
    expect(listed).toHaveLength(1);

    const removed = await deleteFavorite("u1", created.id);
    expect(removed).toBe(true);
    expect(await listFavorites("u1")).toHaveLength(0);
  });
});
