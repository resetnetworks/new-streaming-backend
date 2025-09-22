import express from "express";
import PDFDocument from "pdfkit";
import nodemailer from "nodemailer";
import dotenv from 'dotenv';
dotenv.config();

const app = express();
app.use(express.json());

// 🔹 Helper to generate invoice PDF buffer
const generateInvoiceBuffer = (invoice) => {
  return new Promise((resolve, reject) => {
    try {
     const doc = new PDFDocument({ margin: 50 });
      const buffers = [];
      doc.on("data", buffers.push.bind(buffers));
      doc.on("end", () => resolve(Buffer.concat(buffers)));

      const startX = doc.page.margins.left;
      const endX = doc.page.width - doc.page.margins.right;

      // 1. Header Section
      const headerY = doc.y;

      // Company Name & Info (Left)
      doc.fontSize(20).font("Helvetica-Bold").text(invoice.seller.name, startX, headerY);
      doc.fontSize(10).font("Helvetica").text(invoice.seller.address);
      doc.text(invoice.seller.email);
      doc.text(invoice.seller.phone);
      doc.moveDown();

      // Invoice Details (Right)
      doc.fontSize(14).font("Helvetica-Bold").text(`INVOICE`, endX - 100, headerY, { width: 100, align: "right" });
      doc.fontSize(10).font("Helvetica").text(`Invoice #${invoice.invoiceNumber}`, { align: "right" });
      doc.text(`Issue Date: ${formatDate(invoice.issueDate)}`, { align: "right" });
      doc.text(`Due Date: ${formatDate(invoice.dueDate)}`, { align: "right" });
      doc.moveDown(2);

      // Horizontal line separator
      doc.strokeColor("#aaaaaa").lineWidth(1).moveTo(startX, doc.y).lineTo(endX, doc.y).stroke();
      doc.moveDown();

      // 2. Customer Info Section
      doc.fontSize(10).font("Helvetica-Bold").text("INVOICE TO:", startX);
      doc.font("Helvetica").text(invoice.customer.name);
      doc.text(invoice.customer.email);
      doc.text(invoice.customer.phone);
      doc.moveDown(2);

      // 3. Table
      const tableTop = doc.y;
      const descriptionX = startX;
      const quantityX = 300;
      const priceX = 380;
      const totalX = 450;
      const totalWidth = 100;

      // Table Header
      doc.font("Helvetica-Bold").fontSize(10);
      doc.text("Product or Service", descriptionX, tableTop);
      doc.text("Quantity", quantityX, tableTop, { width: 70, align: "right" });
      doc.text("Price", priceX, tableTop, { width: 70, align: "right" });
      doc.text("Line Total", totalX, tableTop, { width: totalWidth, align: "right" });
      doc.moveDown();

      doc.strokeColor("#cccccc").lineWidth(1).moveTo(startX, doc.y).lineTo(endX, doc.y).stroke();
      doc.moveDown(0.5);

      // Table Rows
      doc.font("Helvetica").fontSize(10);
      invoice.items.forEach(item => {
        const rowHeight = Math.max(
          doc.heightOfString(item.description, { width: quantityX - descriptionX - 10 }),
          doc.heightOfString(item.quantity.toString(), { width: 70 }),
          doc.heightOfString(`${item.price.toFixed(2)}`, { width: 70 }),
          doc.heightOfString(`${item.total.toFixed(2)}`, { width: totalWidth })
        );

        doc.text(item.description, descriptionX, doc.y, { width: quantityX - descriptionX - 10 });
        doc.text(item.quantity.toString(), quantityX, doc.y, { width: 70, align: "right" });
        doc.text(`${item.price.toFixed(2)}`, priceX, doc.y, { width: 70, align: "right" });
        doc.text(`${item.total.toFixed(2)}`, totalX, doc.y, { width: totalWidth, align: "right" });
        
        doc.moveDown(1.5);
      });

      doc.strokeColor("#cccccc").lineWidth(1).moveTo(startX, doc.y).lineTo(endX, doc.y).stroke();
      doc.moveDown(1);
      
      // 4. Totals Section
      const totalsX = endX - 150; // Aligns totals to the right
      
      doc.font("Helvetica-Bold").fontSize(10).text("Subtotal:", totalsX, doc.y, { width: 100, align: "right" });
      doc.font("Helvetica").text(`₹${invoice.subtotal.toFixed(2)}`, endX - 100, doc.y, { width: 100, align: "right" });
      doc.moveDown(0.5);

      invoice.taxBreakdown.forEach(t => {
        doc.font("Helvetica-Bold").text(`${t.name} (${t.rate}%)`, totalsX, doc.y, { width: 100, align: "right" });
        doc.font("Helvetica").text(`₹${t.amount.toFixed(2)}`, endX - 100, doc.y, { width: 100, align: "right" });
        doc.moveDown(0.5);
      });

      doc.moveDown(1);
      doc.strokeColor("#000000").lineWidth(1.5).moveTo(totalsX, doc.y).lineTo(endX, doc.y).stroke();
      doc.moveDown(0.5);

      doc.fontSize(12).font("Helvetica-Bold").text("Invoice Total:", totalsX, doc.y, { width: 100, align: "right" });
      doc.font("Helvetica").fontSize(12).text(`₹${invoice.total.toFixed(2)}`, endX - 100, doc.y, { width: 100, align: "right" });
      doc.moveDown(1);
      
      doc.fontSize(10).font("Helvetica-Bold").text("Amount Paid:", totalsX, doc.y, { width: 100, align: "right" });
      doc.font("Helvetica").text(`₹${invoice.amountPaid.toFixed(2)}`, endX - 100, doc.y, { width: 100, align: "right" });
      doc.moveDown(0.5);

      doc.fontSize(10).font("Helvetica-Bold").text("Balance Due:", totalsX, doc.y, { width: 100, align: "right" });
      doc.font("Helvetica").text(`₹${invoice.balanceDue.toFixed(2)}`, endX - 100, doc.y, { width: 100, align: "right" });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

// 🔹 Email sender
const sendInvoiceEmail = async (to, invoiceBuffer, invoiceNumber) => {
    console.log("Preparing to send email to:", to);
  const transporter = nodemailer.createTransport({
    service: "gmail", // can be SES/SMTP too
    auth: {
      user: process.env.SMTP_USER, // your Gmail
      pass: process.env.SMTP_PASS, // your Gmail App Password
    },
  });
  console.log("Prepared transporter:", transporter);

  await transporter.sendMail({
    from: `"Test App" <${process.env.SMTP_USER}>`,
    to:"contact@reset93.net",
    subject: `Your Invoice #${invoiceNumber}`,
    text: "Attached is your invoice for testing.",
    attachments: [
      {
        filename: `invoice-${invoiceNumber}.pdf`,
        content: invoiceBuffer,
        contentType: "application/pdf",
      },
    ],
  });
};

// 🔹 Test route
app.post("/send-invoice", async (req, res) => {
    console.log("Received request to /send-invoice with body:", req.body);
  try {
    const invoice = {
      invoiceNumber: "INV-" + Date.now(),
      issueDate: new Date(),
      dueDate: new Date(),
      seller: {
        name: "My Test Company",
        address: "123 Test Street, Delhi",
        email: "test@company.com",
        phone: "+91-9999999999",
      },
      customer: {
        name: "John Doe",
        email: req.body.email || "your-test-email@example.com",
        phone: "+91-8888888888",
      },
      items: [
        { description: "Premium Subscription", quantity: 1, price: 499, total: 499 },
      ],
      subtotal: 499,
      taxBreakdown: [{ name: "GST", rate: 18, amount: 89.82 }],
      total: 588.82,
      amountPaid: 588.82,
      balanceDue: 0,
    };
   console.log("Generating invoice for:", invoice.customer.email);
    const buffer = await generateInvoiceBuffer(invoice);
    console.log("Invoice PDF generated, sending email...");
    await sendInvoiceEmail(invoice.customer.email, buffer, invoice.invoiceNumber);
    console.log("Invoice email sent successfully to:", invoice.customer.email);

    res.json({ success: true, message: "Invoice sent!" });
  } catch (err) {
    console.error("❌ Error sending invoice:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

function formatDate(date) {
  return new Date(date).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

app.listen(6000, () => console.log("🚀 Server running on http://localhost:6000"));
