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

