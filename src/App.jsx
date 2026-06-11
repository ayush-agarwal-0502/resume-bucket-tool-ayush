import { useState, useEffect, useMemo } from 'react';
// Import JSZip to handle client-side folder bundling directly inside browser RAM
import JSZip from 'jszip';
import { Analytics } from '@vercel/analytics/react';

export default function App() {
  // ----------------------------------------------------
  // 1. APPLICATION SYSTEM STATE (RAM MEMORY)
  // ----------------------------------------------------
  const [currentPage, setCurrentPage] = useState(1); // Page 1: Upload | Page 2: Workspace | Page 3: Summary
  const [unseenPile, setUnseenPile] = useState([]); 
  const [totalUploadedCount, setTotalUploadedCount] = useState(0);

  // Track which specific file inside the unseen pile the user is currently viewing
  const [viewIndex, setViewIndex] = useState(0);

  // A transaction history stack tracking past actions to allow instant "Undo" recovery
  const [historyLog, setHistoryLog] = useState([]);

  // The 4 core buckets from your human-written PRD specifications
  const [buckets, setBuckets] = useState({
    strongHire: [],
    goodResume: [],
    okayish: [],
    reject: []
  });

  // Track notes associated with each resume filename
  const [resumeNotes, setResumeNotes] = useState({});
  // Shield hotkeys when typing inside an input frame
  const [isNoteInputFocused, setIsNoteInputFocused] = useState(false);

  // Track if zip engine is processing compression algorithms to show a loading state
  const [isCompilingZip, setIsCompilingZip] = useState(false);

  // ----------------------------------------------------
  // PERFORMANCE MEMORY OPTIMIZATION (Anti-Nuclear Reactor Guardrail)
  // ----------------------------------------------------
  // This memo block prevents creating duplicate memory blobs and tearing down the <iframe> on independent state cycles
  const activeFileUrl = useMemo(() => {
    if (unseenPile.length === 0 || !unseenPile[viewIndex]) return '';
    return URL.createObjectURL(unseenPile[viewIndex]);
  }, [unseenPile, viewIndex]);

  // Clean up binary data pointers from browser RAM when URLs change to ensure zero lingering memory leaks
  useEffect(() => {
    return () => {
      if (activeFileUrl) {
        URL.revokeObjectURL(activeFileUrl);
      }
    };
  }, [activeFileUrl]);

  // ----------------------------------------------------
  // 2. DOCUMENT INGESTION PIPELINE
  // ----------------------------------------------------
  const handleFileSelection = (event) => {
    const chosenFiles = Array.from(event.target.files);
    if (chosenFiles.length === 0) return;

    const slicedSelection = chosenFiles.slice(0, 100);
    setUnseenPile(slicedSelection);
    setTotalUploadedCount(slicedSelection.length);
    setViewIndex(0); 
    setHistoryLog([]); 
    setResumeNotes({});
    setIsNoteInputFocused(false);
    
    setBuckets({ strongHire: [], goodResume: [], okayish: [], reject: [] });
    setCurrentPage(2);
  };

  // ----------------------------------------------------
  // 3. CORE PROCESSING ENGINE (SORTING, NAVIGATION, UNDO)
  // ----------------------------------------------------
  const handleNavigateViewer = (direction) => {
    if (direction === 'next' && viewIndex < unseenPile.length - 1) {
      setViewIndex((prev) => prev + 1);
    } else if (direction === 'prev' && viewIndex > 0) {
      setViewIndex((prev) => prev - 1);
    }
  };

  const sortCurrentFileIntoBucket = (bucketKey) => {
    if (unseenPile.length === 0) return;

    // Identify the target file using our active viewer pointer
    const targetFile = unseenPile[viewIndex];

    // Log this action to our history stack before mutating state maps
    setHistoryLog((prev) => [...prev, { file: targetFile, fromBucket: bucketKey, originalIndex: viewIndex }]);

    // Append file into the selected destination bucket array
    setBuckets((prevBuckets) => ({
      ...prevBuckets,
      [bucketKey]: [...prevBuckets[bucketKey], targetFile]
    }));

    // Remove the file from our active unseen pool layout
    setUnseenPile((prevPile) => {
      const updatedPile = prevPile.filter((_, idx) => idx !== viewIndex);
      
      // If no files remain in the pile, advance straight to Page 3 summary screen
      if (updatedPile.length === 0) {
        setCurrentPage(3);
      }
      return updatedPile;
    });

    // UX BOUNDARY GUARD: If we just removed the last item in the list, step back by 1 index pointer
    if (viewIndex >= unseenPile.length - 1 && viewIndex > 0) {
      setViewIndex((prev) => prev - 1);
    }
  };

  const handleUndoLastAction = () => {
    if (historyLog.length === 0) return;

    const lastAction = historyLog[historyLog.length - 1];
    setHistoryLog((prev) => prev.slice(0, -1));

    // Pull the target file straight out of its assigned destination bucket array
    setBuckets((prevBuckets) => ({
      ...prevBuckets,
      [lastAction.fromBucket]: prevBuckets[lastAction.fromBucket].filter((f) => f.name !== lastAction.file.name)
    }));

    // Splice the file frame right back into its original position inside the unseen array pile
    setUnseenPile((prevPile) => {
      const restoredPile = [...prevPile];
      restoredPile.splice(lastAction.originalIndex, 0, lastAction.file);
      return restoredPile;
    });

    // Force the document viewer screen to focus straight back onto the restored file frame
    setViewIndex(lastAction.originalIndex);
  };

  // Helper handling specific updates to inline candidate screening notes
  const handleUpdateNoteText = (filename, text) => {
    setResumeNotes((prev) => ({
      ...prev,
      [filename]: text
    }));
  };

  // ----------------------------------------------------
  // 4. SHORTCUT INTERCEPT KEYBOARD MATRIX
  // ----------------------------------------------------
  useEffect(() => {
    if (currentPage !== 2 || unseenPile.length === 0 || isNoteInputFocused) return;

    const handleKeyDown = (event) => {
      const pressedKey = event.key.toLowerCase();
      
      if (pressedKey === 'q') sortCurrentFileIntoBucket('strongHire');
      if (pressedKey === 'w') sortCurrentFileIntoBucket('goodResume');
      if (pressedKey === 'e') sortCurrentFileIntoBucket('okayish');
      if (pressedKey === 'r') sortCurrentFileIntoBucket('reject');

      if (event.key === 'ArrowRight') handleNavigateViewer('next');
      if (event.key === 'ArrowLeft') handleNavigateViewer('prev');

      if ((event.ctrlKey || event.metaKey) && pressedKey === 'z') {
        event.preventDefault();
        handleUndoLastAction();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPage, unseenPile, viewIndex, historyLog, isNoteInputFocused]);

  // ----------------------------------------------------
  // 5. ASYNC ZIP GENERATION ENGINE WITH CSV COMPILER
  // ----------------------------------------------------
  const handleCompileAndDownloadZip = async () => {
    try {
      setIsCompilingZip(true);
      const zip = new JSZip();
      const rootFolder = zip.folder("ResumeBucketTool");
      
      const dirs = {
        strongHire: rootFolder.folder("1_Strong Hire"),
        goodResume: rootFolder.folder("2_Good Resume"),
        okayish: rootFolder.folder("3_Okayish"), 
        reject: rootFolder.folder("4_Reject")
      };

      buckets.strongHire.forEach(f => dirs.strongHire.file(f.name, f));
      buckets.goodResume.forEach(f => dirs.goodResume.file(f.name, f));
      buckets.okayish.forEach(f => dirs.okayish.file(f.name, f));
      buckets.reject.forEach(f => dirs.reject.file(f.name, f));

      // PRD PHASE 7 OVERFLOW GUARDRAIL: Catch remaining files if user clicked 'Finish Early'
      if (unseenPile.length > 0) {
        const notDecidedDir = rootFolder.folder("Not Decided Yet");
        unseenPile.forEach(f => notDecidedDir.file(f.name, f));
      }

      // --- GENERATE LIGHTWEIGHT SUMMARY CSV ---
      const escapeCSV = (val) => {
        if (!val) return '';
        const dataStr = String(val);
        if (dataStr.includes(',') || dataStr.includes('"') || dataStr.includes('\n') || dataStr.includes('\r')) {
          return `"${dataStr.replace(/"/g, '""')}"`;
        }
        return dataStr;
      };

      let csvContent = "Candidate Resume,Final Decision,Screening Notes\r\n";
      
      const humanLabels = {
        strongHire: "Strong Hire",
        goodResume: "Good Resume",
        okayish: "Okayish",
        reject: "Reject"
      };

      // Loop through sorted buckets
      Object.entries(buckets).forEach(([bucketKey, fileArray]) => {
        fileArray.forEach(f => {
          const noteText = resumeNotes[f.name] || "";
          csvContent += `${escapeCSV(f.name)},${escapeCSV(humanLabels[bucketKey])},${escapeCSV(noteText)}\r\n`;
        });
      });

      // Include remaining undecided entries
      unseenPile.forEach(f => {
        const noteText = resumeNotes[f.name] || "";
        csvContent += `${escapeCSV(f.name)},Not Decided Yet,${escapeCSV(noteText)}\r\n`;
      });

      // Inject compiled text string into the root directory of the ZIP payload
      rootFolder.file("Screening_Summary.csv", csvContent);
      // -----------------------------------------

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const downloadUrl = URL.createObjectURL(zipBlob);
      const hiddenLink = document.createElement("a");
      hiddenLink.href = downloadUrl;
      hiddenLink.download = "ResumeBucketTool.zip";
      document.body.appendChild(hiddenLink);
      hiddenLink.click();
      document.body.removeChild(hiddenLink);
      URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      console.error("Zip generation compilation failure:", err);
    } finally {
      setIsCompilingZip(false);
    }
  };

  const handleReset = () => {
    setUnseenPile([]);
    setTotalUploadedCount(0);
    setBuckets({ strongHire: [], goodResume: [], okayish: [], reject: [] });
    setResumeNotes({});
    setIsNoteInputFocused(false);
    setCurrentPage(1);
  };

  // ----------------------------------------------------
  // 6. VISUAL APP CONTAINER LAYOUT RENDERING
  // ----------------------------------------------------
  return (
    <div className={`min-h-screen p-6 flex flex-col items-center font-sans selection:bg-emerald-100 text-slate-900 ${currentPage === 1 ? 'bg-gradient-to-b from-emerald-100/60 via-zinc-50 to-emerald-100/60' : 'bg-emerald-40/50'}`}>
      
      <header className="w-full max-w-5xl mb-8 border-b pb-4 flex justify-between items-center shrink-0 min-h-[52px] border-slate-200">
        <div>
          {currentPage !== 1 && (
            <>
              <h1 className="text-xl font-black text-slate-900 tracking-tight">Resume Bucketing Tool</h1>
              <p className="text-slate-500 text-xs mt-0.5 font-medium">Free online tool designed for humans who screen resumes</p>
            </>
          )}
          {currentPage === 1 && <div className="h-9" />}
        </div>
        {currentPage > 1 && (
          <button onClick={handleReset} className="text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg border border-red-200 transition-colors cursor-pointer shadow-2xs">
            Clear & Restart
          </button>
        )}
      </header>

      {/* PAGE 1: HUMAN-FIRST HOMEPAGE AND DROPZONE UPLOAD */}
      {currentPage === 1 && (
        <main className="w-full max-w-4xl mt-4 flex flex-col items-center grow">
          
          <div className="text-center max-w-2xl mb-12">
            <h2 className="text-4xl font-black text-slate-900 tracking-tight sm:text-5xl">
              Resume Bucketing Tool
            </h2>
            <p className="text-base text-slate-600 font-medium mt-3 sm:text-lg">
              Free online tool designed for humans who screen resumes
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full mb-12">
            
            <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-2xs flex flex-col transition-all hover:shadow-xs">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold font-mono text-sm mb-3.5 border border-emerald-100">
                1
              </div>
              <h3 className="text-sm font-bold text-slate-900 mb-1.5">Upload Resumes</h3>
              <p className="text-slate-600 text-xs leading-relaxed">
                Drop your batch of PDFs. Your resumes stay completely on your device—processing happens inside your browser, so your candidate data is 100% private.
              </p>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-2xs flex flex-col transition-all hover:shadow-xs">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold font-mono text-sm mb-3.5 border border-emerald-100">
                2
              </div>
              <h3 className="text-sm font-bold text-slate-900 mb-1.5">Bucket via Hotkeys</h3>
              <p className="text-slate-600 text-xs leading-relaxed">
                Read candidate files on a clean screen side-by-side with sorting options. Use rapid keystrokes (<span className="font-mono font-bold text-emerald-600">Q, W, E, R</span>) to instantly separate them.
              </p>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-2xs flex flex-col transition-all hover:shadow-xs">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold font-mono text-sm mb-3.5 border border-emerald-100">
                3
              </div>
              <h3 className="text-sm font-bold text-slate-900 mb-1.5">Get Summary Data</h3>
              <p className="text-slate-600 text-xs leading-relaxed">
                Add evaluation notes cleanly as you review. Download an organized ZIP file containing cleanly sorted folders and an exportable `.csv` tracking spreadsheet.
              </p>
            </div>

          </div>

          <div className="w-full max-w-xl bg-white p-6 rounded-xl border border-slate-200/80 shadow-xs mb-16">
            <h4 className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-3">Ready to begin screening?</h4>
            <label className="border-2 border-dashed border-slate-200 hover:border-emerald-500 rounded-lg p-10 flex flex-col items-center justify-center cursor-pointer transition-all bg-slate-50/50 hover:bg-emerald-50/10 group">
              <div className="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center shadow-2xs text-emerald-600 group-hover:text-emerald-700 group-hover:border-emerald-300 transition-colors mb-3">
                ➕
              </div>
              <span className="text-sm font-bold text-slate-800 group-hover:text-emerald-700 transition-colors">Select Resumes</span>
              <span className="text-slate-500 text-xs mt-1 font-medium">Supports up to 100 PDFs at once</span>
              <input type="file" multiple accept=".pdf" onChange={handleFileSelection} className="hidden" />
            </label>
          </div>

          {/* CREATOR PROFILE FOOTER BANNER WITH LIGHT CLEAN UI INTEGRATION */}
          <footer className="w-full bg-white border border-slate-200 rounded-2xl p-6 md:p-8 mt-auto shadow-2xs">
            <div className="flex flex-col md:flex-row gap-8 items-center md:items-start">
              
              {/* Left Column: Picture Profile */}
              <div className="flex-shrink-0">
                <img 
                  src="/ayush-photo.jpg" 
                  alt="Ayush Agarwal" 
                  className="w-36 h-36 rounded-xl border border-slate-200 object-cover shadow-2xs bg-slate-50 transition-transform duration-300 hover:scale-[1.02]"
                  onError={(e) => {
                    e.target.style.display = 'none';
                  }}
                />
              </div>

              {/* Right Column: Details and Monetization */}
              <div className="flex-1 text-center md:text-left space-y-4">
                
                {/* Title Row */}
                <div className="flex flex-col sm:flex-row items-center justify-center md:justify-start gap-3">
                  <h5 className="text-xl font-extrabold text-slate-900 tracking-tight">Made by - Ayush Agarwal</h5>
                  <a 
                    href="https://www.linkedin.com/in/ayush-agarwal-261041215/" 
                    target="_blank" 
                    rel="noreferrer" 
                    className="text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-md shadow-2xs transition-all"
                  >
                    Connect on LinkedIn ↗
                  </a>
                </div>

                {/* Academic Context Badges */}
                <div className="flex flex-wrap justify-center md:justify-start gap-2 text-xs font-semibold">
                  <span className="bg-slate-50 text-slate-700 border border-slate-200/80 px-3 py-1.5 rounded-lg shadow-2xs">
                    IIT BHU Varanasi (ECE '24)
                  </span>
                  <span className="bg-slate-50 text-slate-700 border border-slate-200/80 px-3 py-1.5 rounded-lg shadow-2xs">
                    IIM Indore (PGP '28)
                  </span>
                </div>

                <hr className="border-slate-100 my-2" />

                {/* Support Disclaimer */}
                <div className="bg-slate-50/80 border border-slate-200/60 rounded-xl p-3 max-w-2xl">
                  <p className="text-xs text-slate-600 font-medium leading-relaxed">
                    <span className="font-bold text-emerald-700">Support This Project:</span> If you enjoy using this application, please consider giving a star on the github repo !
                  </p>
                </div>

                {/* WHY I BUILT THIS & CONTEXT SECTION (Saves SEO Niche & Content Depth) */}
                <div className="text-xs text-slate-500 font-medium leading-relaxed max-w-2xl pt-1 space-y-2.5">
                  <p>
                    <strong>Why I Built This Tool:</strong> While working on a hiring cycle, I was handed 10s of candidate resumes at once by my manager to evaluate and filter. This was the stage, where ATS had already filtered out top 50 resumes from the incoming bundle, and our team was supposed to be the human layer to check which resumes we found worth interviewing. I found myself manually opening files, adding judgement on Excel, closing tabs, and shifting folders back and forth. It quickly became clear that the standard user experience UX for human layer of resume filtering was broken and fragmented. 
                  </p>
                  <p>
                    To solve this problem, I invented this tool. Its a UI/UX level innovation. User can feed in the resumes (which btw will 100% stay on your laptop, as I dont even have a server or backend), and get a nice window, where they can simply see the resumes, and with a single keyboard click, they can throw the resumes into 4 buckets, thus triaging much faster. Once the process is completed, they can simply download the resumes bucketed by folders, and happily proceed with the interviews. 
                  </p>
                  <p>
                    I'm sure the problem must have been solved before by expensive B2B HR Tech softwares, however I wanted to make a simple B2C application, which anyone, from a startup with no HR software, to a hiring manager in a medium sized company, or even a college club leader who is recruiting for their club, anyone can simply use my tool, and triage through resumes fast.  
                  </p>
                </div>

              </div>
            </div>
          </footer>

        </main>
      )}

      {/* PAGE 2: MAIN REVIEW DESK WORKSPACE */}
      {currentPage === 2 && unseenPile.length > 0 && (
        <main className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-3 gap-6 items-start grow">
          
          <div className="lg:col-span-2 space-y-4 h-full flex flex-col">
            
            <div className="bg-white px-4 py-2.5 rounded-xl border border-slate-200 shadow-2xs flex justify-between items-center shrink-0 gap-4">
              <span className="text-sm font-bold text-slate-800 truncate font-mono max-w-[55%] flex-1">
                📄 {unseenPile[viewIndex].name}
              </span>
              
              <div className="flex items-center space-x-3 shrink-0">
                <div className="flex items-center bg-zinc-50 rounded-lg border border-slate-200 p-0.5 shrink-0">
                  <button 
                    onClick={() => handleNavigateViewer('prev')}
                    disabled={viewIndex === 0}
                    className="p-1 px-2 text-xs font-bold text-slate-600 disabled:text-slate-300 hover:bg-white rounded-md disabled:hover:bg-transparent transition-all cursor-pointer"
                  >
                    ←
                  </button>
                  <span className="text-xs font-mono px-2 text-emerald-800 font-bold whitespace-nowrap">
                    {viewIndex + 1} / {unseenPile.length}
                  </span>
                  <button 
                    onClick={() => handleNavigateViewer('next')}
                    disabled={viewIndex === unseenPile.length - 1}
                    className="p-1 px-2 text-xs font-bold text-slate-600 disabled:text-slate-300 hover:bg-white rounded-md disabled:hover:bg-transparent transition-all cursor-pointer"
                  >
                    →
                  </button>
                </div>
                <button onClick={() => setCurrentPage(3)} className="text-[11px] font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-md transition-colors cursor-pointer shrink-0">
                  Finish Early
                </button>
              </div>
            </div>

            {/* Core Workspace Frame Renderer */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden h-[72vh] grow">
              <iframe
                src={`${activeFileUrl}#view=Fit`}
                className="w-full h-full border-0"
                title="Active PDF Render Frame"
                key={unseenPile[viewIndex].name} 
              />
            </div>
          </div>

          <div className="lg:col-span-1 space-y-4">
            
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <div className="flex justify-between items-center mb-1">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Unseen Pile Remaining</h3>
                {historyLog.length > 0 && (
                  <button onClick={handleUndoLastAction} className="text-[10px] text-emerald-700 hover:underline font-bold">
                    ↩ Undo Last (Ctrl+Z)
                  </button>
                )}
              </div>
              <div className="text-2xl font-black text-slate-800 font-mono">
                {unseenPile.length} <span className="text-xs text-slate-400 font-normal">Files Left</span>
              </div>
              <div className="w-full bg-zinc-100 h-1.5 rounded-full mt-3 overflow-hidden">
                <div className="bg-gradient-to-r from-emerald-500 to-teal-500 h-full transition-all duration-300" style={{ width: `${((totalUploadedCount - unseenPile.length) / totalUploadedCount) * 100}%` }} />
              </div>
            </div>

            {/* LIVE SCREENING EVALUATION NOTES CONTAINER */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Screening Notes</h3>
              <textarea
                value={resumeNotes[unseenPile[viewIndex].name] || ""}
                onChange={(e) => handleUpdateNoteText(unseenPile[viewIndex].name, e.target.value)}
                onFocus={() => setIsNoteInputFocused(true)}
                onBlur={() => setIsNoteInputFocused(false)}
                placeholder="Type screening context here... (Hotkeys disabled while typing)"
                className="w-full min-h-[76px] text-xs p-2.5 rounded-lg border border-slate-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 outline-hidden resize-none placeholder:text-slate-400 font-medium bg-slate-50/30 transition-all text-slate-800 leading-relaxed"
              />
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-2">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Select Target Bucket</h3>
              
              <button onClick={() => sortCurrentFileIntoBucket('strongHire')} className="w-full text-left p-3 rounded-lg border border-slate-200 hover:border-emerald-600 hover:bg-emerald-50/40 font-semibold text-slate-700 hover:text-emerald-700 transition-all cursor-pointer flex justify-between items-center group text-xs">
                <span>Strong Hire ({buckets.strongHire.length})</span>
                <span className="text-[10px] font-bold bg-slate-100 border border-slate-200 group-hover:bg-emerald-100 group-hover:border-emerald-200 px-1.5 py-0.5 rounded-md text-slate-400 group-hover:text-emerald-600 font-mono">Q</span>
              </button>
              
              <button onClick={() => sortCurrentFileIntoBucket('goodResume')} className="w-full text-left p-3 rounded-lg border border-slate-200 hover:border-blue-600 hover:bg-blue-50/40 font-semibold text-slate-700 hover:text-blue-700 transition-all cursor-pointer flex justify-between items-center group text-xs">
                <span>Good Resume ({buckets.goodResume.length})</span>
                <span className="text-[10px] font-bold bg-slate-100 border border-slate-200 group-hover:bg-blue-100 group-hover:border-blue-200 px-1.5 py-0.5 rounded-md text-slate-400 group-hover:text-blue-600 font-mono">W</span>
              </button>
              
              <button onClick={() => sortCurrentFileIntoBucket('okayish')} className="w-full text-left p-3 rounded-lg border border-slate-200 hover:border-amber-600 hover:bg-amber-50/40 font-semibold text-slate-700 hover:text-amber-700 transition-all cursor-pointer flex justify-between items-center group text-xs">
                <span>Okayish ({buckets.okayish.length})</span>
                <span className="text-[10px] font-bold bg-slate-100 border border-slate-200 group-hover:bg-amber-100 group-hover:border-amber-200 px-1.5 py-0.5 rounded-md text-slate-400 group-hover:text-amber-600 font-mono">E</span>
              </button>
              
              <button onClick={() => sortCurrentFileIntoBucket('reject')} className="w-full text-left p-3 rounded-lg border border-slate-200 hover:border-red-600 hover:bg-red-50/40 font-semibold text-slate-700 hover:text-red-700 transition-all cursor-pointer flex justify-between items-center group text-xs">
                <span>Reject ({buckets.reject.length})</span>
                <span className="text-[10px] font-bold bg-slate-100 border border-slate-200 group-hover:bg-red-100 group-hover:border-red-200 px-1.5 py-0.5 rounded-md text-slate-400 group-hover:text-red-600 font-mono">R</span>
              </button>
            </div>

          </div>
        </main>
      )}

      {/* PAGE 3: SUMMARY SCREEN */}
      {currentPage === 3 && (
        <main className="w-full max-w-md mt-8 space-y-4">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-2xs text-center">
            <span className="text-3xl">🎉</span>
            <h2 className="text-lg font-bold text-slate-900 mt-2">All Resumes Bucketed!</h2>
            <p className="text-xs text-slate-500 mt-1">Ready to compile your downloadable zip bundle.</p>
            
            <button onClick={handleCompileAndDownloadZip} disabled={isCompilingZip} className="mt-5 w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:from-emerald-400 disabled:to-teal-400 text-white font-bold py-3 px-4 rounded-xl shadow-xs text-sm cursor-pointer transition-colors">
              {isCompilingZip ? 'Compiling ZIP...' : '⚡ Finish & Download ZIP'}
            </button>
          </div>

          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-2xs space-y-3.5">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-2">
              Final Distribution Summary
            </h3>
            
            <div className="flex justify-between items-center text-sm">
              <span className="font-medium text-slate-600">🟢 Strong Hire</span>
              <span className="font-mono bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full text-xs font-bold border border-emerald-100">
                {buckets.strongHire.length} files
              </span>
            </div>
            
            <div className="flex justify-between items-center text-sm">
              <span className="font-medium text-slate-600">🔵 Good Resume</span>
              <span className="font-mono bg-blue-50 text-blue-700 px-2.5 py-0.5 rounded-full text-xs font-bold border border-blue-100">
                {buckets.goodResume.length} files
              </span>
            </div>
            
            <div className="flex justify-between items-center text-sm">
              <span className="font-medium text-slate-600">🟡 Okayish</span>
              <span className="font-mono bg-amber-50 text-amber-700 px-2.5 py-0.5 rounded-full text-xs font-bold border border-amber-100">
                {buckets.okayish.length} files
              </span>
            </div>
            
            <div className="flex justify-between items-center text-sm">
              <span className="font-medium text-slate-600">🔴 Reject</span>
              <span className="font-mono bg-red-50 text-red-700 px-2.5 py-0.5 rounded-full text-xs font-bold border border-red-100">
                {buckets.reject.length} files
              </span>
            </div>

            {unseenPile.length > 0 && (
              <div className="flex justify-between items-center text-sm border-t border-dashed border-slate-100 pt-3 mt-1">
                <span className="font-medium text-slate-400">⚪ Not Decided Yet</span>
                <span className="font-mono bg-slate-100 text-slate-500 px-2.5 py-0.5 rounded-full text-xs font-bold border border-slate-200">
                  {unseenPile.length} files
                </span>
              </div>
            )}
          </div>
        </main>
      )}

      <Analytics />
    </div>
  );
}