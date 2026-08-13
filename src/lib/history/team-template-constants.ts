export const MY_FAVORITES_CATEGORY = "我的收藏";
export const MY_FAVORITES_CATEGORY_ID = "cat_my_favorites";

export function isMyFavoritesCategory(
  value?: string | { id?: string; name?: string } | null,
) {
  if (!value) {
    return false;
  }
  if (typeof value === "string") {
    return value === MY_FAVORITES_CATEGORY || value === MY_FAVORITES_CATEGORY_ID;
  }
  return (
    value.id === MY_FAVORITES_CATEGORY_ID || value.name === MY_FAVORITES_CATEGORY
  );
}
