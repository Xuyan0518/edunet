// import React, { useState, useEffect } from "react";
// import { useParams, useLocation } from "react-router-dom";
// import {
//   Card,
//   CardContent,
//   CardHeader,
//   CardTitle,
//   CardDescription,
//   CardFooter,
// } from "@/components/ui/card";
// import { Button } from "@/components/ui/button";
// import { Label } from "@/components/ui/label";
// import { Input } from "@/components/ui/input";
// import { Textarea } from "@/components/ui/textarea";
// import {
//   Select,
//   SelectTrigger,
//   SelectValue,
//   SelectContent,
//   SelectItem,
// } from "@/components/ui/select";
// import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
// import { Calendar as CalendarIcon, Plus, MinusCircle, CheckCircle2 } from "lucide-react";
// import { Calendar } from "@/components/ui/calendar";
// import { format } from "date-fns";
// import { useToast } from '@/hooks/use-toast';
// import { buildApiUrl } from '@/config/api';
// import SubjectTopicsPanel from '@/components/ui/SubjectTopicsPanel';


// type Activity = {
//   subject: string;
//   description: string;
//   performance: string;
//   notes?: string;
// };

// type DailyProgress = {
//   id: string;
//   studentId: string;
//   date: string;
//   attendance: "present" | "absent" | "late";
//   activities: Activity[];
// };

// type Student = {
//   id: string;
//   name: string;
//   grade: string;
// };

// const performanceOptions = [
//   { value: "excellent", label: "Excellent" },
//   { value: "good", label: "Good" },
//   { value: "needs improvement", label: "Needs Improvement" },
// ];

// const StudentDetail: React.FC = () => {
//   const { id } = useParams<{ id: string }>();
//   const location = useLocation();

//   const [student, setStudent] = useState<Student | null>(location.state?.student || null);
//   const [selectedDate, setSelectedDate] = useState<Date | undefined>();
//   const [progress, setProgress] = useState<DailyProgress | null>(null);
//   const [loading, setLoading] = useState(false);
//   const [error, setError] = useState<string | null>(null);
//   const [editMode, setEditMode] = useState(false);
//   const [originalProgress, setOriginalProgress] = useState<DailyProgress | null>(null);

//   const { toast } = useToast();

//   // Fetch student if not passed via location state (like on refresh)
//   console.log("selected student: ", student)
//   useEffect(() => {
//     if (!student && id) {
//       fetch(buildApiUrl(`students/${id}`))
//         .then((res) => {
//           if (!res.ok) throw new Error("Failed to fetch student");
//           return res.json();
//         })
//         .then((data) => setStudent(data))
//         .catch((err) => setError(err.message));
//     }
//   }, [student, id]);

//   // Fetch progress for selected date
//   useEffect(() => {
//     if (!id || !selectedDate) return;

//     setLoading(true);
//     setError(null);
//     setProgress(null);

//     fetch(
//       `${buildApiUrl('progress/student')}?studentId=${id}&date=${selectedDate}`
//     )
//       .then(async (res) => {
//         if (!res.ok) {
//           const err = await res.json();
//           throw new Error(err.error || "Failed to fetch progress");
//         }
//         return res.json();
//       })
//       .then((data: DailyProgress) => {
//         setProgress(data);
//         setEditMode(false);
//       })
//       .catch((err) => {
//         setProgress(null);
//         setError(err.message);
//       })
//       .finally(() => setLoading(false));
//   }, [id, selectedDate]);

//   const saveProgress = async () => {
//     console.log("progress: ", JSON.stringify(progress, null, 2))
//     if (!progress) return;
//     if (progress.activities.some((a) => !a.subject || !a.description || !a.performance)) {
//       toast({
//         title: 'Error',
//         description: 'Please fill out all required fields for each activity',
//         variant: 'destructive',
//       });
//       return;
//     }
//     try {
//       const res = await fetch(buildApiUrl(`progress/${progress.id}`), {
//         method: "PUT",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify(progress),
//       });
//       if (!res.ok) throw new Error("Failed to save progress");
//       setEditMode(false);
//       toast({
//           title: 'Success',
//           description: 'Progress updated successfully'
//         });
//     } catch (err) {
//       console.error(err);
//       alert("Error saving progress");
//     }
//   };

//   if (!student) {
//     return (
//       <div className="container mx-auto py-8 px-4">
//         <p>Student not found.</p>
//       </div>
//     );
//   }

//   return (
//     <div className="container mx-auto py-8 px-4 max-w-4xl animate-fade-in">
//       <h1 className="text-3xl font-bold mb-4">{student.name}&apos;s Progress</h1>
//       <p className="mb-6">
//         Grade: <span className="font-semibold">{student.grade}</span>
//       </p>

//       {/* Date Picker */}
//       <div className="mb-6 max-w-sm">
//         <Label>Date</Label>
//         <Popover>
//           <PopoverTrigger asChild>
//             <Button
//               variant="outline"
//               className="w-full justify-start text-left font-normal focus-within-ring"
//             >
//               <CalendarIcon className="mr-2 h-4 w-4" />
//               {selectedDate ? format(selectedDate, "PPP") : <span>Pick a date</span>}
//             </Button>
//           </PopoverTrigger>
//           <PopoverContent className="w-auto p-0">
//             <Calendar
//               mode="single"
//               selected={selectedDate}
//               onSelect={setSelectedDate}
//               initialFocus
//               disabled={(date) => date > new Date()}
//             />
//           </PopoverContent>
//         </Popover>
//       </div>

//       {loading && <p>Loading progress...</p>}
//       {error && <p className="text-red-600">{error}</p>}

//       {selectedDate && !loading && !error && (
//         <>
//           {progress ? (
//             <form
//               onSubmit={(e) => {
//                 e.preventDefault();
//                 saveProgress();
//               }}
//               className="space-y-8"
//             >
//               {/* Attendance Card */}
//               <Card>
//                 <CardHeader>
//                   <CardTitle>Daily Progress – {format(selectedDate, "PPP")}</CardTitle>
//                   <CardDescription>Attendance and activities for the day</CardDescription>
//                 </CardHeader>
//                 <CardContent className="space-y-4">
//                   <div>
//                     <Label>Attendance</Label>
//                     <div className="flex space-x-4 mt-2">
//                       {["present", "absent", "late"].map((status) => (
//                         <div key={status} className="flex items-center space-x-2">
//                           <input
//                             type="radio"
//                             id={status}
//                             value={status}
//                             checked={progress.attendance === status}
//                             onChange={() =>
//                               editMode &&
//                               setProgress({ ...progress, attendance: status as DailyProgress["attendance"] })
//                             }
//                             disabled={!editMode}
//                             className={`h-4 w-4 ${
//                               status === "present"
//                                 ? "text-primary"
//                                 : status === "absent"
//                                 ? "text-destructive"
//                                 : "text-amber-500"
//                             }`}
//                           />
//                           <Label htmlFor={status} className="cursor-pointer capitalize">
//                             {status}
//                           </Label>
//                         </div>
//                       ))}
//                     </div>
//                   </div>
//                 </CardContent>
//               </Card>

//               {/* Activities Card */}
//               <Card>
//                 <CardHeader>
//                   <CardTitle>Activities</CardTitle>
//                   <CardDescription>Record activities and performance for the day</CardDescription>
//                 </CardHeader>
//                 <CardContent className="space-y-6">
//                   {progress.activities.map((activity, idx) => (
//                     <div
//                       key={idx}
//                       className="space-y-4 p-4 border border-border rounded-md relative"
//                     >
//                       {/* Remove button only in edit mode if more than 1 activity */}
//                       {editMode && progress.activities.length > 1 && (
//                         <div className="absolute top-4 right-4">
//                           <Button
//                             type="button"
//                             variant="ghost"
//                             size="icon"
//                             onClick={() => {
//                               if (!editMode) return;
//                               const updated = [...progress.activities];
//                               updated.splice(idx, 1);
//                               setProgress({ ...progress, activities: updated });
//                             }}
//                           >
//                             <MinusCircle className="h-5 w-5 text-destructive" />
//                           </Button>
//                         </div>
//                       )}

//                       <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
//                         <div className="space-y-2">
//                           <Label>Subject</Label>
//                           <Input
//                             value={activity.subject}
//                             onChange={(e) => {
//                               if (!editMode) return;
//                               const updated = [...progress.activities];
//                               updated[idx].subject = e.target.value;
//                               setProgress({ ...progress, activities: updated });
//                             }}
//                             placeholder="Enter subject"
//                             disabled={!editMode}
//                             className="focus-within-ring"
//                           />
//                         </div>

//                         <div className="space-y-2">
//                           <Label>Performance</Label>
//                           <Select
//                             value={activity.performance}
//                             onValueChange={(val) => {
//                               if (!editMode) return;
//                               const updated = [...progress.activities];
//                               updated[idx].performance = val;
//                               setProgress({ ...progress, activities: updated });
//                             }}
//                             disabled={!editMode}
//                           >
//                             <SelectTrigger className="focus-within-ring">
//                               <SelectValue placeholder="Rate performance" />
//                             </SelectTrigger>
//                             <SelectContent>
//                               {performanceOptions.map((option) => (
//                                 <SelectItem key={option.value} value={option.value}>
//                                   {option.label}
//                                 </SelectItem>
//                               ))}
//                             </SelectContent>
//                           </Select>
//                         </div>
//                       </div>

//                       <div className="space-y-2">
//                         <Label>Description</Label>
//                         <Input
//                           value={activity.description}
//                           onChange={(e) => {
//                             if (!editMode) return;
//                             const updated = [...progress.activities];
//                             updated[idx].description = e.target.value;
//                             setProgress({ ...progress, activities: updated });
//                           }}
//                           placeholder="Describe the activity"
//                           disabled={!editMode}
//                           className="focus-within-ring"
//                         />
//                       </div>

//                       <div className="space-y-2">
//                         <Label>Teacher Notes</Label>
//                         <Textarea
//                           value={activity.notes || ""}
//                           onChange={(e) => {
//                             if (!editMode) return;
//                             const updated = [...progress.activities];
//                             updated[idx].notes = e.target.value;
//                             setProgress({ ...progress, activities: updated });
//                           }}
//                           placeholder="Additional notes or observations"
//                           disabled={!editMode}
//                           className="focus-within-ring"
//                         />
//                       </div>
//                     </div>
//                   ))}

//                   {editMode && (
//                     <Button
//                       type="button"
//                       variant="outline"
//                       onClick={() => {
//                         setProgress({
//                           ...progress,
//                           activities: [
//                             ...progress.activities,
//                             { subject: "", description: "", performance: "", notes: "" },
//                           ],
//                         });
//                       }}
//                       className="w-full"
//                     >
//                       <Plus className="h-4 w-4 mr-2" />
//                       Add Another Activity
//                     </Button>
//                   )}
//                 </CardContent>

//                 <CardFooter className="flex justify-end space-x-4">
//                   {editMode ? (
//                     <>
//                       <Button
//                         variant="outline"
//                         type="button"
//                         onClick={() => {
//                           if (originalProgress) {
//                             setProgress(originalProgress); // Restore saved snapshot
//                           }
//                           setEditMode(false);
//                         }}
//                       >
//                         Cancel
//                       </Button>
//                       <Button type="submit">
//                         <CheckCircle2 className="h-4 w-4 mr-2" />
//                         Save Changes
//                       </Button>
//                     </>
//                   ) : (
//                     <Button
//                       variant="outline"
//                       type="button"
//                       onClick={() => {
//                         setOriginalProgress(progress); // Save current progress snapshot
//                         setEditMode(true);
//                       }}
//                     >
//                       Edit
//                     </Button>
//                   )}
//                 </CardFooter>
//               </Card>
//             </form>
//           ) : (
//             <p>No progress data for this date.</p>
//           )}
//         </>
//       )}
//       {/* Subjects and Topics Panel */}
//       {student && (
//         <SubjectTopicsPanel studentId={student.id} />
//       )}
//     </div>
//   );
// };

// export default StudentDetail;

import React, { useEffect, useState } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { buildApiUrl } from "@/config/api";
import SubjectTopicsPanel from "@/components/ui/SubjectTopicsPanel";

type Student = {
  id: string;
  name: string;
  grade: string;
};

const StudentDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [student, setStudent] = useState<Student | null>(location.state?.student || null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!student && id) {
      fetch(buildApiUrl(`students/${id}`))
        .then((res) => {
          if (!res.ok) throw new Error("Failed to fetch student");
          return res.json();
        })
        .then((data) => setStudent(data))
        .catch((err) => setError(err.message));
    }
  }, [student, id]);

  if (error) {
    return (
      <div className="container mx-auto py-8 px-4">
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="container mx-auto py-8 px-4">
        <p>Student not found.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl animate-fade-in">
      {/* Header row with name + buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
        <div>
          <h1 className="text-3xl font-bold">{student.name}</h1>
          <p>
            年级: <span className="font-semibold">{student.grade}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={() => navigate(`/daily-progress?student=${student.id}`)}
            className="bg-white text-black border hover:bg-blue-600 hover:text-white"
          >
            添加每日进度
          </Button>
          <Button
            onClick={() => navigate(`/weekly-feedback?student=${student.id}`)}
            className="bg-white text-black border hover:bg-blue-600 hover:text-white"
          >
            添加每周汇报
          </Button>
        </div>
      </div>

      {/* Subjects & Topics */}
      <SubjectTopicsPanel studentId={student.id} />
    </div>
  );
};

export default StudentDetail;

