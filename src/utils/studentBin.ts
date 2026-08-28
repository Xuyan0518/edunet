export type BinMutationItem = {
  recordType: string;
  recordId: string;
};

export const toBinMutationBody = ({ recordType, recordId }: BinMutationItem) => ({
  recordType,
  recordId,
});
