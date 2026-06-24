import { useState } from "react";

import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import api from "../api/api";

function Reports() {
  const [downloading, setDownloading] = useState("");

  const downloadReport = async (endpoint, filename, mimeType) => {
    try {
      setDownloading(filename);

      const res = await api.get(endpoint, {
        responseType: "blob",
      });

      const blob = new Blob([res.data], {
        type: mimeType,
      });

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      link.remove();

      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Report download failed:", err);
      alert(err?.response?.data?.detail || "Unable to download report.");
    } finally {
      setDownloading("");
    }
  };

  const reportCards = [
    {
      title: "Transactions Report",
      desc: "Download all executed buy/sell trades with symbol, quantity, price, value, and time.",
      csvEndpoint: "/reports/transactions.csv",
      pdfEndpoint: "/reports/transactions.pdf",
      csvFilename: "transactions.csv",
      pdfFilename: "transactions.pdf",
      badge: "Trade History",
    },
    {
      title: "Orders Report",
      desc: "Download complete order book with executed, pending, cancelled, and rejected orders.",
      csvEndpoint: "/reports/orders.csv",
      pdfEndpoint: "/reports/orders.pdf",
      csvFilename: "orders.csv",
      pdfFilename: "orders.pdf",
      badge: "Order Book",
    },
    {
      title: "Holdings Report",
      desc: "Download open positions with quantity, average price, current price, value, and P&L.",
      csvEndpoint: "/reports/holdings.csv",
      pdfEndpoint: "/reports/holdings.pdf",
      csvFilename: "holdings.csv",
      pdfFilename: "holdings.pdf",
      badge: "Portfolio",
    },
    {
      title: "Portfolio Report",
      desc: "Download account-level summary including cash, total value, and total P&L.",
      csvEndpoint: "/reports/portfolio.csv",
      pdfEndpoint: "/reports/portfolio.pdf",
      csvFilename: "portfolio.csv",
      pdfFilename: "portfolio.pdf",
      badge: "Summary",
    },
  ];

  return (
    <div className="dashboard-layout">
      <Sidebar />

      <div className="dashboard-main">
        <Navbar />

        <div className="dashboard-content professional-dashboard">
          <div className="pro-dashboard-hero">
            <div>
              <p className="pro-eyebrow">Export Center</p>

              <h1>
                Reports <span>& Downloads</span>
              </h1>

              <p>
                Download CSV and PDF reports for transactions, orders, holdings,
                and portfolio summaries.
              </p>
            </div>

            <div className="pro-status-card">
              <span className="status-pill status-success">CSV + PDF Ready</span>
              <p>All reports are generated from your live account data.</p>
            </div>
          </div>

          <div className="dashboard-cards">
            {reportCards.map((report) => (
              <div className="stat-card" key={report.csvFilename}>
                <h4>{report.badge}</h4>
                <h2 style={{ fontSize: "22px" }}>{report.title}</h2>

                <p
                  style={{
                    color: "#64748b",
                    fontWeight: "700",
                    lineHeight: "1.6",
                    minHeight: "72px",
                  }}
                >
                  {report.desc}
                </p>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "10px",
                    marginTop: "14px",
                  }}
                >
                  <button
                    className="primary-action"
                    onClick={() =>
                      downloadReport(
                        report.csvEndpoint,
                        report.csvFilename,
                        "text/csv;charset=utf-8;"
                      )
                    }
                    disabled={downloading === report.csvFilename}
                  >
                    {downloading === report.csvFilename ? "..." : "CSV"}
                  </button>

                  <button
                    className="warning-action"
                    onClick={() =>
                      downloadReport(
                        report.pdfEndpoint,
                        report.pdfFilename,
                        "application/pdf"
                      )
                    }
                    disabled={downloading === report.pdfFilename}
                  >
                    {downloading === report.pdfFilename ? "..." : "PDF"}
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="pro-panel" style={{ marginTop: "24px" }}>
            <div className="pro-panel-header">
              <div>
                <h2>Report Formats</h2>
                <p>Use CSV for Excel analysis and PDF for clean submission.</p>
              </div>
            </div>

            <div className="market-card-list">
              <div className="market-card-item">
                <div>
                  <strong>CSV Reports</strong>
                  <p style={{ margin: "6px 0 0", color: "#64748b" }}>
                    Best for Excel, Google Sheets, filtering, calculations, and
                    portfolio analysis.
                  </p>
                </div>
                <span>Editable</span>
              </div>

              <div className="market-card-item">
                <div>
                  <strong>PDF Reports</strong>
                  <p style={{ margin: "6px 0 0", color: "#64748b" }}>
                    Best for presentation, submission, review, and documentation.
                  </p>
                </div>
                <span>Printable</span>
              </div>
            </div>
          </div>

          <div className="footer-note">
            PDF export requires backend dependency reportlab. Add it to
            requirements.txt and install with pip if not already installed.
          </div>
        </div>
      </div>
    </div>
  );
}

export default Reports;
