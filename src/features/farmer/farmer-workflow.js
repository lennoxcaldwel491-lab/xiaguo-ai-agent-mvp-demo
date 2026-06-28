export function createProductFromReport(report, status, channelForGrade) {
  if (!report) return null;
  const channel = channelForGrade(report.grade);
  return {
    id: report.product_id,
    title: `${report.origin} ${report.grade === "blocked" ? "待复核" : `${report.grade} 级`}苹果`,
    image: report.image,
    grade: report.grade,
    status,
    origin: report.origin,
    weight: report.weight,
    price: report.expected_price,
    confidence: report.confidence,
    defectLabel: report.defect_label,
    safetyLabel: report.safety_label,
    consumerCopy: report.consumer_copy,
    channelLabel: channel.label,
    channelDetail: channel.detail,
    report
  };
}

export function upsertProduct(products, product) {
  return [product, ...products.filter((item) => item.id !== product.id)];
}
