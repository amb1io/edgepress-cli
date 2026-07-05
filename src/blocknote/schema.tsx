import { BlockNoteSchema, defaultBlockSpecs } from "@blocknote/core";
import { withMultiColumn } from "@blocknote/xl-multi-column";

export const edgepressBlockNoteSchema = withMultiColumn(
  BlockNoteSchema.create({
    blockSpecs: {
      ...defaultBlockSpecs,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any,
);
