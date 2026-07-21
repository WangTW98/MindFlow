# UI composition contract

Workflow version 3 uses analysis-packet schema version 2. It models a screen as ordered semantic wireframe content without changing the MindFlow storage or renderer contract.

## Normalized records

- `screens[]`: `semanticKey`, `name`, `pageType`, `application`, `parent`, `domainKeys`, `roleKeys`, `regionKeys`, evidence metadata.
- `regions[]`: `semanticKey`, `screenKey`, `name`, `kind`, `layout`, `order`, `featureKeys`, evidence metadata.
- `features[]`: `semanticKey`, `screenKey`, `regionKey`, `name`, `uiType`, `order`, `contentSpec`, optional `dataBinding`, `required`, `visibleWhen`, and `interaction`, plus evidence metadata.

Region kinds are `header`, `navigation`, `summary`, `filter`, `form`, `content`, `list`, `table`, `detail`, `tabs`, `actions`, `feedback`, `footer`, and `overlay`. Layout values are `stack`, `row`, `grid`, `list`, `table`, `form`, `tabs`, `toolbar`, and `overlay`.

UI types are `text`, `image`, `badge`, `metric`, `chart`, `field`, `selector`, `upload`, `button`, `link`, `tab`, `card`, `list-item`, `table`, `row-action`, `pagination`, `notice`, `status`, and `media`.

`contentSpec` is a non-empty string array describing visible fields, columns, labels, options, formats, or content within one UI block. `interaction`, when present, contains `event`, `effect`, optional `targetSemanticKey`, and optional `edgeType`. Cross-node interaction targets require a graph edge from that feature item.

## Ordering and fidelity

Order screens top-to-bottom, then left-to-right within a row. Region and feature orders start at 1 and are contiguous within their owner. Every key listed by an owner must resolve and match the actual sorted child order.

Explicit UI facts retain their original evidence. Product inference is allowed only when the source defines a capability but omits necessary composition; inferred records require `reason` and `confidence`. High-impact or low-confidence choices stay unresolved.

One feature is one understandable visible block or control. A table can be one feature whose `contentSpec` lists columns, while each cross-page row action is a separate feature outlet. Do not reduce an entire page to one feature group of capability verbs.

## Canvas mapping

- screen -> generic node;
- region -> ordered feature group;
- feature -> ordered feature item;
- `uiType` -> feature-item `type`;
- visible `contentSpec`, conditions, and effect -> concise item description;
- `dataBinding` and `required` -> existing feature-item fields;
- interaction target -> edge from the concrete feature-item outlet.

The canvas card is a semantic wireframe, not a pixel-perfect mockup.
