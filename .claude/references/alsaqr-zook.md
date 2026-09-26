# alsaqr-zook

- Path: `~/projects/alsaqr-zook`
- Repo: https://github.com/AliA1997/alsaqr-zook

Source of Zona's **Products / Marketplace** domain (browse by category, list, buy, sell). Same
stack/conventions as `alsaqr-frontend-v2`. Category-per-route model: 8 `ProductCategories` enum
members, each with its own route and MobX feed store. Selling and buying both live in one
`userProductsFeedStore` (`sellingProductsRegistry` + `buyingProductsRegistry`).
`ProductRecord.productCategoryId` is a string, not numerically aligned with the enum. The
product/location/notification API clients now live in the shared `alsaqr-web-core` package, not
locally in this repo.
