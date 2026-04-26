"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { LoadingState } from "@/components/shared/LoadingState";
import { ErrorState } from "@/components/shared/ErrorState";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import Papa from "papaparse";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle,
  XCircle,
  AlertCircle,
  Download,
  History,
} from "lucide-react";

interface Organization {
  id: string;
  name: string;
}

interface UploadResult {
  uploadJobId: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  createdProjects: number;
  errors: Array<{
    row: number;
    errors: string[];
    data: Record<string, unknown>;
  }>;
}

interface UploadJob {
  id: string;
  uploadedAt: string;
  status: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  organization: { name: string };
  uploadedBy: { email: string; displayName: string | null };
}

const CSV_TEMPLATE = `title,description,countryCode,sectorKey,status,startDate,endDate,latitude,longitude,budgetUsd,targetBeneficiaries,districtCounty,donor,locationName,dataSource,contactEmail
"Sample Project","Description of the project",US,HEALTH,ACTIVE,2024-01-01,2024-12-31,40.7128,-74.0060,100000,1500,"New York County","USAID","New York, NY","Field Survey",contact@example.org`;

export default function UploadPage() {
  const { isSystemOwner, user } = useAuth();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [uploadHistory, setUploadHistory] = useState<UploadJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedOrg, setSelectedOrg] = useState<string>("");
  const [csvData, setCsvData] = useState<Record<string, unknown>[] | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [orgsRes, historyRes] = await Promise.all([
        fetch("/api/organizations?activeOnly=true"),
        fetch("/api/upload"),
      ]);

      if (!orgsRes.ok) throw new Error("Failed to load organizations");

      const [orgsData, historyData] = await Promise.all([
        orgsRes.json(),
        historyRes.json(),
      ]);

      setOrganizations(orgsData.organizations || []);
      setUploadHistory(historyData.uploadJobs || []);

      if (!isSystemOwner && user?.organization) {
        setSelectedOrg(user.organization.id);
      }
    } catch (err) {
      setError("Unable to load data. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [isSystemOwner, user]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setUploadResult(null);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        setCsvData(results.data as Record<string, unknown>[]);
        toast.success(`Parsed ${results.data.length} rows from CSV`);
      },
      error: (err) => {
        toast.error(`Failed to parse CSV: ${err.message}`);
        setCsvData(null);
      },
    });
  }, []);

  const handleUpload = async () => {
    if (!csvData || csvData.length === 0) {
      toast.error("No data to upload");
      return;
    }

    if (isSystemOwner && !selectedOrg) {
      toast.error("Please select an organization");
      return;
    }

    setUploading(true);
    setUploadResult(null);

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: csvData,
          organizationId: selectedOrg || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Upload failed");
      }

      setUploadResult(data);

      if (data.invalidRows === 0) {
        toast.success(`Successfully created ${data.createdProjects} projects`);
      } else {
        toast.warning(`Created ${data.createdProjects} projects, ${data.invalidRows} rows had errors`);
      }

      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const downloadTemplate = () => {
    const blob = new Blob([CSV_TEMPLATE], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "project_upload_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div data-design-id="upload-page" className="p-8">
      <div
        data-design-id="upload-header"
        className="mb-6"
      >
        <h1
          data-design-id="upload-title"
          className="text-2xl font-bold text-slate-900"
        >
          Bulk Upload
        </h1>
        <p
          data-design-id="upload-subtitle"
          className="text-slate-600"
        >
          Upload multiple projects from a CSV file
        </p>
      </div>

      {loading && <LoadingState message="Loading..." />}

      {error && <ErrorState message={error} onRetry={fetchData} />}

      {!loading && !error && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card data-design-id="upload-card">
              <CardHeader>
                <CardTitle>Upload CSV File</CardTitle>
                <CardDescription>
                  Upload a CSV file containing project data. Required fields: title, description, countryCode, sectorKey, status, startDate, latitude, longitude.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {isSystemOwner && (
                  <div className="grid gap-2">
                    <Label htmlFor="organization">Organization *</Label>
                    <Select value={selectedOrg} onValueChange={setSelectedOrg}>
                      <SelectTrigger id="organization">
                        <SelectValue placeholder="Select organization" />
                      </SelectTrigger>
                      <SelectContent>
                        {organizations.map((org) => (
                          <SelectItem key={org.id} value={org.id}>
                            {org.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div
                  data-design-id="upload-dropzone"
                  className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:border-sky-500 transition-colors"
                >
                  <FileSpreadsheet className="w-12 h-12 mx-auto text-slate-400 mb-4" />
                  <p className="text-slate-600 mb-2">
                    {fileName || "Drop your CSV file here or click to browse"}
                  </p>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileUpload}
                    className="hidden"
                    id="csv-upload"
                  />
                  <label htmlFor="csv-upload">
                    <Button type="button" variant="outline" asChild>
                      <span>
                        <Upload className="w-4 h-4 mr-2" />
                        Select File
                      </span>
                    </Button>
                  </label>
                </div>

                {csvData && (
                  <div className="bg-slate-50 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-slate-900">{fileName}</p>
                        <p className="text-sm text-slate-600">{csvData.length} rows ready to upload</p>
                      </div>
                      <Button
                        onClick={handleUpload}
                        disabled={uploading}
                        className="bg-sky-600 hover:bg-sky-700"
                      >
                        {uploading ? "Uploading..." : "Upload Projects"}
                      </Button>
                    </div>
                  </div>
                )}

                {uploadResult && (
                  <div className="space-y-4">
                    <Alert
                      className={
                        uploadResult.invalidRows === 0
                          ? "border-sky-200 bg-sky-50"
                          : "border-amber-200 bg-amber-50"
                      }
                    >
                      {uploadResult.invalidRows === 0 ? (
                        <CheckCircle className="w-4 h-4 text-sky-600" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-amber-600" />
                      )}
                      <AlertTitle>Upload Complete</AlertTitle>
                      <AlertDescription>
                        {uploadResult.createdProjects} projects created, {uploadResult.invalidRows} rows with errors
                      </AlertDescription>
                    </Alert>

                    {uploadResult.errors.length > 0 && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-lg flex items-center">
                            <XCircle className="w-5 h-5 text-red-500 mr-2" />
                            Validation Errors
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Row</TableHead>
                                <TableHead>Errors</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {uploadResult.errors.slice(0, 10).map((err, idx) => (
                                <TableRow key={idx}>
                                  <TableCell>{err.row}</TableCell>
                                  <TableCell>
                                    <ul className="list-disc list-inside text-sm text-red-600">
                                      {err.errors.map((e, i) => (
                                        <li key={i}>{e}</li>
                                      ))}
                                    </ul>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                          {uploadResult.errors.length > 10 && (
                            <p className="text-sm text-slate-500 mt-2">
                              Showing first 10 of {uploadResult.errors.length} errors
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card data-design-id="template-card">
              <CardHeader>
                <CardTitle>CSV Template</CardTitle>
                <CardDescription>
                  Download our template to ensure correct formatting
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={downloadTemplate}
                  variant="outline"
                  className="w-full"
                  data-design-id="download-template"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download Template
                </Button>
                <div className="mt-4 text-sm text-slate-600 space-y-1">
                  <p><strong>Required fields:</strong></p>
                  <ul className="list-disc list-inside">
                    <li>title</li>
                    <li>description</li>
                    <li>countryCode</li>
                    <li>sectorKey</li>
                    <li>status (ACTIVE, PLANNED, COMPLETED)</li>
                    <li>startDate (YYYY-MM-DD)</li>
                    <li>latitude</li>
                    <li>longitude</li>
                  </ul>
                  <p className="mt-3"><strong>Optional fields:</strong></p>
                  <ul className="list-disc list-inside">
                    <li>endDate, budgetUsd, targetBeneficiaries</li>
                    <li>
                      <code>districtCounty</code> — must match an active
                      District / County name for the given country (managed in
                      CMS)
                    </li>
                    <li>
                      <code>donor</code> — must match an active Donor name
                      (managed in CMS)
                    </li>
                    <li>locationName, dataSource, contactEmail</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            <Card data-design-id="history-card">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <History className="w-5 h-5 mr-2" />
                  Recent Uploads
                </CardTitle>
              </CardHeader>
              <CardContent>
                {uploadHistory.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-4">
                    No upload history
                  </p>
                ) : (
                  <div className="space-y-3">
                    {uploadHistory.slice(0, 5).map((job) => (
                      <div
                        key={job.id}
                        className="flex items-center justify-between text-sm p-2 bg-slate-50 rounded"
                      >
                        <div>
                          <p className="font-medium">{job.organization.name}</p>
                          <p className="text-slate-500 text-xs">
                            {formatDate(job.uploadedAt)}
                          </p>
                        </div>
                        <div className="text-right">
                          <Badge
                            variant="outline"
                            className={
                              job.status === "COMPLETED"
                                ? "bg-sky-50 text-sky-700"
                                : job.status === "FAILED"
                                ? "bg-red-50 text-red-700"
                                : "bg-amber-50 text-amber-700"
                            }
                          >
                            {job.validRows}/{job.totalRows}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}