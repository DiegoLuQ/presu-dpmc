'use client';

import React, { useRef, useState } from 'react';
import { Upload, FileSpreadsheet, X, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';

interface UploadExcelProps {
    onUpload: (data: any[]) => void;
    onClose: () => void;
    templateColumns: string[];
    templateExample?: Record<string, string>;
    maxSizeMB?: number;
}

export default function UploadExcel({ 
    onUpload, 
    onClose, 
    templateColumns, 
    templateExample,
    maxSizeMB = 5 
}: UploadExcelProps) {
    const [file, setFile] = useState<File | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [excelData, setExcelData] = useState<any[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (!selectedFile) return;

        const fileSizeMB = selectedFile.size / (1024 * 1024);
        if (fileSizeMB > maxSizeMB) {
            setError(`El archivo excede el tamaño máximo de ${maxSizeMB}MB`);
            return;
        }

        setError(null);
        setFile(selectedFile);

        try {
            setLoading(true);
            const data = await readExcel(selectedFile);
            setExcelData(data);
        } catch (err) {
            setError('Error al leer el archivo. Asegúrate de que sea un archivo Excel válido.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const readExcel = (file: File): Promise<any[]> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = e.target?.result;
                    const workbook = XLSX.read(data, { type: 'binary' });
                    const sheetName = workbook.SheetNames[0];
                    const sheet = workbook.Sheets[sheetName];
                    const jsonData = XLSX.utils.sheet_to_json(sheet);
                    resolve(jsonData);
                } catch (err) {
                    reject(err);
                }
            };
            reader.onerror = reject;
            reader.readAsBinaryString(file);
        });
    };

    const handleUpload = () => {
        if (excelData.length > 0) {
            onUpload(excelData);
        }
    };

    const handleDownloadTemplate = () => {
        const ws = XLSX.utils.json_to_sheet(templateExample ? [templateExample] : []);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Plantilla');
        XLSX.writeFile(wb, 'plantilla.xlsx');
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-gray-900/60" onClick={onClose} />
            
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        <FileSpreadsheet className="text-green-600" size={24} />
                        Importar desde Excel
                    </h3>
                    <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
                        <X size={20} />
                    </button>
                </div>

                <div className="px-6 py-4 space-y-4">
                    {error && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                            {error}
                        </div>
                    )}

                    <div className="flex gap-3">
                        <button
                            onClick={handleDownloadTemplate}
                            className="px-4 py-2 text-sm font-medium text-primary bg-primary/10 rounded-lg hover:bg-primary/20 transition-colors"
                        >
                            Descargar Plantilla
                        </button>
                    </div>

                    <div 
                        className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".xlsx,.xls"
                            onChange={handleFileChange}
                            className="hidden"
                        />
                        {loading ? (
                            <div className="flex flex-col items-center gap-2">
                                <Loader2 className="animate-spin text-primary" size={32} />
                                <span className="text-gray-500">Leyendo archivo...</span>
                            </div>
                        ) : file ? (
                            <div className="flex flex-col items-center gap-2">
                                <FileSpreadsheet className="text-green-600" size={32} />
                                <span className="font-medium text-gray-900">{file.name}</span>
                                <span className="text-sm text-gray-500">{(file.size / 1024).toFixed(1)} KB - {excelData.length} registros</span>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center gap-2">
                                <Upload className="text-gray-400" size={32} />
                                <span className="text-gray-500">Haz clic o arrastra un archivo Excel</span>
                            </div>
                        )}
                    </div>
                </div>

                <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleUpload}
                        disabled={excelData.length === 0}
                        className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Importar {excelData.length} registros
                    </button>
                </div>
            </div>
        </div>
    );
}