import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  pdf,
} from "@react-pdf/renderer";
import type {
  Invoice,
  InvoiceItem,
  InvoiceMetadataSettings,
} from "@/Config/types";

type InvoicePdfOptions = {
  customerAddress?: string;
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 24,
    paddingHorizontal: 24,
    paddingBottom: 20,
    fontSize: 10,
    fontFamily: "Helvetica",
  },
  headerWrap: {
    position: "relative",
    width: "100%",
    alignItems: "center",
    marginBottom: 12,
    minHeight: 56,
  },
  logo: {
    position: "absolute",
    right: -15,
    top: 0,
    width: 100,
    height: 50,
    objectFit: "contain",
  },
  companyName: {
    fontSize: 22,
    fontFamily: "Times-Bold",
    letterSpacing: 0.2,
    marginBottom: 4,
    marginTop: 2,
    color: "#021e6d",
  },
  companyAddress: {
    fontSize: 10,
    fontFamily: "Times-Bold",
    textAlign: "center",
    lineHeight: 1.3,
    color: "#021e6d",
  },
  titleRow: {
    marginTop: 6,
    marginBottom: 8,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  title: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
  },
  headerDivider: {
    borderTopWidth: 1,
    borderColor: "#111",
    width: "100%",
    marginTop: 2,
    marginBottom: 8,
  },
  metaBlock: {
    marginBottom: 8,
    gap: 2,
  },
  metaTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  metaDate: {
    fontSize: 10,
    textAlign: "right",
  },
  metaText: {
    fontSize: 10,
    lineHeight: 1.25,
  },
  table: {
    borderWidth: 1,
    borderColor: "#111",
    marginTop: 4,
  },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderColor: "#111",
    backgroundColor: "#f7f7f7",
  },
  colNo: {
    width: "6%",
    borderRightWidth: 1,
    borderColor: "#111",
    paddingVertical: 4,
    paddingHorizontal: 3,
    textAlign: "center",
  },
  colDesc: {
    width: "58%",
    borderRightWidth: 1,
    borderColor: "#111",
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  colQty: {
    width: "8%",
    borderRightWidth: 1,
    borderColor: "#111",
    paddingVertical: 4,
    paddingHorizontal: 3,
    textAlign: "right",
  },
  colUnit: {
    width: "14%",
    borderRightWidth: 1,
    borderColor: "#111",
    paddingVertical: 4,
    paddingHorizontal: 4,
    textAlign: "right",
  },
  colAmount: {
    width: "14%",
    paddingVertical: 4,
    paddingHorizontal: 4,
    textAlign: "right",
  },
  tableHeaderText: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    textAlign: "center",
  },
  row: {
    flexDirection: "row",
    minHeight: 20,
  },
  rowCell: {
    borderBottomWidth: 0.6,
    borderBottomColor: "#ddd",
  },
  groupRow: {
    flexDirection: "row",
    borderBottomWidth: 0.8,
    borderColor: "#ccc",
    backgroundColor: "#fafafa",
  },
  groupText: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    textAlign: "center",
  },
  descName: {
    fontSize: 10,
    lineHeight: 1.25,
  },
  descTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 6,
  },
  descPartNo: {
    fontSize: 8,
    color: "#555",
    textAlign: "right",
    lineHeight: 1.25,
    maxWidth: "45%",
  },
  descSub: {
    fontSize: 8,
    color: "#555",
    marginTop: 1,
    lineHeight: 1.25,
  },
  totalRow: {
    flexDirection: "row",
    marginTop: 0,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: "#111",
  },
  totalLabel: {
    width: "86%",
    paddingVertical: 5,
    paddingHorizontal: 6,
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
  },
  totalAmount: {
    width: "14%",
    paddingVertical: 5,
    paddingHorizontal: 6,
    textAlign: "right",
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
  },
  footer: {
    marginTop: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  bankBlock: {
    width: "62%",
  },
  bankRow: {
    flexDirection: "row",
    marginBottom: 3,
  },
  bankLabel: {
    width: 105,
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
  },
  bankValue: {
    flex: 1,
    fontSize: 10,
    lineHeight: 1.25,
  },
  signBlock: {
    width: "34%",
    alignItems: "center",
    marginTop: 30,
    marginRight: 50,
  },
  signImage: {
    width: 300,
    height: 120,
    objectFit: "contain",
    marginBottom: 2,
  },
  pageFooter: {
    position: "absolute",
    bottom: 10,
    left: 24,
    right: 24,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    fontSize: 9,
    color: "#666",
  },
  pageFooterLine: {
    position: "absolute",
    bottom: 30,
    left: 24,
    right: 24,
    borderTopWidth: 0.6,
    borderColor: "#999",
  },
  pageFooterNotes: {
    maxWidth: "75%",
    paddingRight: 8,
  },
  pageFooterPageNo: {
    textAlign: "right",
  },
});

const formatSymbolAmount = (value: number, currency: string) =>
  {
    const isJPY = (currency || "USD").toUpperCase() === "JPY";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      minimumFractionDigits: isJPY ? 0 : 2,
      maximumFractionDigits: isJPY ? 0 : 2,
    })
      .format(value || 0)
      .replace(/\u00A0/g, " ")
      .replace(/^(-?)([^\d]+)\s*(\d)/, "$1$2 $3");
  };

const preserveLineBreaks = (value: string) =>
  (value || "").replace(/\\n/g, "\n");

const formatInvoiceDate = (date: Date) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);

const getInvoiceBankAccount = (
  invoice: Invoice,
  metadata: InvoiceMetadataSettings | null,
) => {
  if (invoice.bankAccount) {
    return invoice.bankAccount;
  }

  if (invoice.bankAccountId && metadata?.bankAccounts?.length) {
    const matched = metadata.bankAccounts.find(
      (account) => account.id === invoice.bankAccountId,
    );
    if (matched) {
      return matched;
    }
  }

  if (metadata?.bankAccounts?.length) {
    return metadata.bankAccounts[0];
  }

  return {
    bankName: metadata?.bankName || "",
    branch: metadata?.branch || "",
    swiftCode: metadata?.swiftCode || "",
    bankAddress: metadata?.bankAddress || "",
    accountName: metadata?.accountName || "",
    accountType: metadata?.accountType || "",
    accountNumber: metadata?.accountNumber || "",
  };
};

type GroupChunk = {
  id: string;
  name: string;
  isShow: boolean;
  items: InvoiceItem[];
};

const paginateGroupsByItems = (
  groups: Invoice["itemGroups"] | undefined,
  itemsPerPage: number,
): GroupChunk[][] => {
  const sortedGroups =
    groups?.map((group) => ({
      id: group.id,
      name: group.name,
      isShow: group.isShow,
      items: [...(group.items || [])].sort(
        (a, b) =>
          (a.lineNo ?? Number.MAX_SAFE_INTEGER) -
          (b.lineNo ?? Number.MAX_SAFE_INTEGER),
      ),
    })) || [];

  const pages: GroupChunk[][] = [];
  let currentPage: GroupChunk[] = [];
  let currentCount = 0;

  for (const group of sortedGroups) {
    let currentGroupItems: InvoiceItem[] = [];
    const headerRows = group.isShow && itemsPerPage > 1 ? 1 : 0;
    let headerReservedForCurrentChunk = false;

    const flushGroupChunk = () => {
      if (currentGroupItems.length === 0) return;
      currentPage.push({
        id: group.id,
        name: group.name,
        isShow: group.isShow,
        items: currentGroupItems,
      });
      currentGroupItems = [];
      headerReservedForCurrentChunk = false;
    };

    const ensureChunkHeaderSpace = () => {
      if (headerReservedForCurrentChunk || headerRows === 0) return;
      if (currentCount + headerRows > itemsPerPage) {
        flushGroupChunk();
        pages.push(currentPage);
        currentPage = [];
        currentCount = 0;
      }
      currentCount += headerRows;
      headerReservedForCurrentChunk = true;
    };

    for (const item of group.items) {
      ensureChunkHeaderSpace();

      if (currentCount + 1 > itemsPerPage) {
        flushGroupChunk();
        pages.push(currentPage);
        currentPage = [];
        currentCount = 0;
        ensureChunkHeaderSpace();
      }

      currentGroupItems.push(item);
      currentCount += 1;
    }

    flushGroupChunk();
  }

  if (currentPage.length > 0) {
    pages.push(currentPage);
  }

  if (pages.length === 0) {
    pages.push([]);
  }

  return pages;
};

const getPageRowUsage = (pageGroups: GroupChunk[]) =>
  pageGroups.reduce((sum, group) => {
    const headerRows = group.isShow ? 1 : 0;
    return sum + headerRows + group.items.length;
  }, 0);

const shouldMoveFooterToNextPage = (
  lastPageGroups: GroupChunk[],
  paymentTerms: string,
  _bankAddress: string
) => {
  const pageRows = getPageRowUsage(lastPageGroups);
  const hasPaymentTerms = paymentTerms.trim().length > 0;
  const threshold = hasPaymentTerms ? 16 : 19;
  return pageRows > threshold;
};

const InvoicePdfDocument = ({
  invoice,
  metadata,
  customerAddress,
}: {
  invoice: Invoice;
  metadata: InvoiceMetadataSettings | null;
  customerAddress?: string;
}) => {
  const logoUrl = metadata?.logoUrl?.trim() || "/invoice-logo.png";
  const itemsPerPage = Math.max(1, Math.floor(invoice.itemsPerPage ?? 20));
  const pages = paginateGroupsByItems(invoice.itemGroups, itemsPerPage);
  const bankAccount = getInvoiceBankAccount(invoice, metadata);
  const paymentTerms = preserveLineBreaks(metadata?.bankNotes || "").trim();
  const needsDedicatedFooterPage = shouldMoveFooterToNextPage(
    pages[pages.length - 1] || [],
    paymentTerms,
    preserveLineBreaks(bankAccount.bankAddress || "")
  );
  const renderPages = needsDedicatedFooterPage ? [...pages, []] : pages;

  return (
    <Document title={invoice.invoiceNo || "Invoice"}>
      {renderPages.map((pageGroups, pageIndex) => {
        const isLastPage = pageIndex === renderPages.length - 1;
        const pageNo = pageIndex + 1;
        const pageCount = renderPages.length;
        return (
          <Page
            size="A4"
            style={styles.page}
            key={`invoice-page-${pageIndex + 1}`}
          >
            <View style={styles.headerWrap}>
              <Image src={logoUrl} style={styles.logo} />
              <Text style={styles.companyName}>
                {metadata?.companyName || "COMPANY NAME"}
              </Text>
              {!!metadata?.companyAddress && (
                <Text style={styles.companyAddress}>
                  {preserveLineBreaks(metadata.companyAddress)}
                </Text>
              )}
              {(metadata?.phone || metadata?.fax) && (
                <Text style={styles.companyAddress}>
                  {metadata?.phone ? `Tel: ${metadata.phone}` : ""}
                  {metadata?.phone && metadata?.fax ? "   " : ""}
                  {metadata?.fax ? `Fax: ${metadata.fax}` : ""}
                </Text>
              )}
            </View>
            <View style={styles.headerDivider} />

            <View style={styles.titleRow}>
              <Text style={styles.title}>COMMERCIAL INVOICE</Text>
            </View>

            <View style={styles.metaBlock}>
              <View style={styles.metaTopRow}>
                <Text style={styles.metaText}>
                  Invoice No: {invoice.invoiceNo}
                </Text>
                <Text style={styles.metaDate}>
                  Invoice Date: {formatInvoiceDate(invoice.date)}
                </Text>
              </View>
              {pageIndex === 0 && (
                <>
                  <Text style={styles.metaText}>
                    Bill To: {invoice.customerName}
                  </Text>
                  <Text style={styles.metaText}>
                    Address:{" "}
                    {preserveLineBreaks((customerAddress || "").trim() || "-")}
                  </Text>
                  <Text style={styles.metaText}>
                    Remarks: {preserveLineBreaks(invoice.remarks?.trim() || "-")}
                  </Text>
                </>
              )}
            </View>

            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={[styles.colNo, styles.tableHeaderText]}>No</Text>
                <Text style={[styles.colDesc, styles.tableHeaderText]}>
                  Description
                </Text>
                <Text style={[styles.colQty, styles.tableHeaderText]}>Qty</Text>
                <Text style={[styles.colUnit, styles.tableHeaderText]}>
                  Unit
                </Text>
                <Text style={[styles.colAmount, styles.tableHeaderText]}>
                  Amount
                </Text>
              </View>

              {pageGroups.map((group) => (
                <View key={`${group.id}-${pageIndex}`}>
                  {group.isShow && (
                    <View style={styles.groupRow}>
                      <Text style={styles.colNo} />
                      <Text style={[styles.colDesc, styles.groupText]}>
                        {group.name}
                      </Text>
                      <Text style={styles.colQty} />
                      <Text style={styles.colUnit} />
                      <Text style={styles.colAmount} />
                    </View>
                  )}

                  {group.items.map((item, index) => (
                    <View
                      style={styles.row}
                      key={`${group.id}-${pageIndex}-${item.itemsCatalogId || item.itemName || index}-${index}`}
                    >
                      <Text style={[styles.colNo, styles.rowCell]}>
                        {item.lineNo ?? index + 1}
                      </Text>
                      <View style={[styles.colDesc, styles.rowCell]}>
                        <View style={styles.descTopRow}>
                          <Text style={styles.descName}>
                            {item.itemName || "-"}
                          </Text>
                          {!!item.partNo && (
                            <Text style={styles.descPartNo}>{item.partNo}</Text>
                          )}
                        </View>
                      </View>
                      <Text style={[styles.colQty, styles.rowCell]}>
                        {item.quantity ?? 0}
                      </Text>
                      <Text style={[styles.colUnit, styles.rowCell]}>
                        {formatSymbolAmount(
                          item.unitPrice ?? 0,
                          invoice.currency,
                        )}
                      </Text>
                      <Text style={[styles.colAmount, styles.rowCell]}>
                        {formatSymbolAmount(
                          item.totalPrice ?? 0,
                          invoice.currency,
                        )}
                      </Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>

            {isLastPage && (
              <>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Total</Text>
                  <Text style={styles.totalAmount}>
                    {formatSymbolAmount(
                      invoice.totalAmount || 0,
                      invoice.currency,
                    )}
                  </Text>
                </View>

                <View style={styles.footer}>
                  <View style={styles.bankBlock}>
                    <View style={styles.bankRow}>
                      <Text style={styles.bankLabel}>Banker:</Text>
                      <Text style={styles.bankValue}>
                        {preserveLineBreaks(bankAccount.bankName || "-")}
                      </Text>
                    </View>
                    <View style={styles.bankRow}>
                      <Text style={styles.bankLabel}>Branch:</Text>
                      <Text style={styles.bankValue}>
                        {preserveLineBreaks(bankAccount.branch || "-")}
                      </Text>
                    </View>
                    <View style={styles.bankRow}>
                      <Text style={styles.bankLabel}>Swift Code:</Text>
                      <Text style={styles.bankValue}>
                        {preserveLineBreaks(bankAccount.swiftCode || "-")}
                      </Text>
                    </View>
                    <View style={styles.bankRow}>
                      <Text style={styles.bankLabel}>Bank Address:</Text>
                      <Text style={styles.bankValue}>
                        {preserveLineBreaks(bankAccount.bankAddress || "-")}
                      </Text>
                    </View>
                    <View style={{ height: 8 }} />
                    <View style={styles.bankRow}>
                      <Text style={styles.bankLabel}>Account Name:</Text>
                      <Text style={styles.bankValue}>
                        {preserveLineBreaks(bankAccount.accountName || "-")}
                      </Text>
                    </View>
                    <View style={styles.bankRow}>
                      <Text style={styles.bankLabel}>Account Type:</Text>
                      <Text style={styles.bankValue}>
                        {preserveLineBreaks(bankAccount.accountType || "-")}
                      </Text>
                    </View>
                    <View style={styles.bankRow}>
                      <Text style={styles.bankLabel}>Account Number:</Text>
                      <Text style={styles.bankValue}>
                        {preserveLineBreaks(bankAccount.accountNumber || "-")}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.signBlock}>
                    <Image src="/signature.jpg" style={styles.signImage} />
                  </View>
                </View>
                {!!paymentTerms && (
                  <View style={[styles.bankRow, { marginTop: 8 }]}>
                    <Text style={styles.bankLabel}>Payment Terms:</Text>
                    <Text style={styles.bankValue}>{paymentTerms}</Text>
                  </View>
                )}
              </>
            )}

            <View style={styles.pageFooterLine} />
            <View style={styles.pageFooter}>
              <Text style={styles.pageFooterNotes}>
                {preserveLineBreaks(metadata?.footerNotes?.trim() || "")}
              </Text>
              <Text style={styles.pageFooterPageNo}>
                Page {pageNo} of {pageCount}
              </Text>
            </View>
          </Page>
        );
      })}
    </Document>
  );
};

export const downloadInvoicePdf = async (
  invoice: Invoice,
  metadata: InvoiceMetadataSettings | null,
  options?: InvoicePdfOptions,
) => {
  const doc = (
    <InvoicePdfDocument
      invoice={invoice}
      metadata={metadata}
      customerAddress={options?.customerAddress}
    />
  );
  const blob = await pdf(doc).toBlob();
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
};
