import{afterEach,beforeEach,describe,expect,it,vi}from'vitest';
import{cleanup,fireEvent,render,screen,waitFor}from'@testing-library/react';
import App from './App';
import{api}from'./api';
vi.mock('./api',async()=>{const actual=await vi.importActual('./api');return{...actual,api:vi.fn()};});
const mock=vi.mocked(api);
const id='ac6ff87c-117a-4bdd-9239-738e93d59285';
beforeEach(()=>{mock.mockReset();});afterEach(cleanup);
function session(role:string){mock.mockImplementation(async(path)=>{
  if(path==='/meta')return{name:'HR Platform'}as never;
  if(path==='/auth/me')return{id:'u',email:'user@test.local',roles:[role]}as never;
  if(path.startsWith('/employees'))return{total:0,items:[]}as never;
  if(path==='/structure')return{branches:[],departments:[],jobs:[{id,name:'أخصائي',departmentId:'d'}]}as never;
  return undefined as never;
});}
describe('authenticated UI',()=>{
  it('hides HR, payroll and administration navigation from employees',async()=>{
    session('Employee');render(<App/>);await screen.findByRole('button',{name:'ملفي'});
    expect(screen.queryByRole('button',{name:'الحسابات والصلاحيات'})).toBeNull();
    expect(screen.queryByRole('button',{name:'البيانات المالية'})).toBeNull();
    expect(screen.queryByRole('button',{name:'المنشأة والهيكل'})).toBeNull();
  });
  it('shows login errors without pretending authentication succeeded',async()=>{
    mock.mockImplementation(async(path)=>{if(path==='/meta')return{name:'HR Platform'}as never;throw new Error('بيانات الدخول غير صحيحة.');});
    render(<App/>);await screen.findByRole('button',{name:'دخول إلى حسابك'});
    fireEvent.change(screen.getByLabelText('البريد الإلكتروني'),{target:{value:'bad@test.local'}});
    fireEvent.change(screen.getByLabelText('كلمة المرور'),{target:{value:'bad'}});
    fireEvent.click(screen.getByRole('button',{name:'دخول إلى حسابك'}));
    expect((await screen.findByRole('alert')).textContent).toContain('بيانات الدخول غير صحيحة.');
    expect(screen.queryByRole('button',{name:'تسجيل الخروج'})).toBeNull();
  });
  it('submits a real employee command and refreshes the list only after success',async()=>{
    session('HR');render(<App/>);fireEvent.click(await screen.findByRole('button',{name:'الموظفون'}));
    fireEvent.click(await screen.findByRole('button',{name:'+ إضافة موظف'}));
    await screen.findByLabelText('الاسم الكامل');
    fireEvent.change(screen.getByLabelText('الرقم الوظيفي'),{target:{value:'E900'}});
    fireEvent.change(screen.getByLabelText('الاسم الكامل'),{target:{value:'موظف جديد'}});
    fireEvent.change(screen.getByLabelText('الوظيفة'),{target:{value:id}});
    fireEvent.click(screen.getByRole('button',{name:'حفظ الموظف'}));
    await waitFor(()=>expect(mock).toHaveBeenCalledWith('/employees','POST',expect.objectContaining({number:'E900',fullName:'موظف جديد',jobPositionId:id,managerId:null,version:null})));
    await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
  });
  it('blocks committing an Excel preview containing validation errors',async()=>{
    session('HR');const normal=mock.getMockImplementation()!;
    mock.mockImplementation(async(path,...rest)=>path==='/import/employees/preview'?[{row:2,employee:null,error:'رقم مكرر'}]as never:normal(path,...rest));
    render(<App/>);fireEvent.click(await screen.findByRole('button',{name:'استيراد الموظفين'}));
    fireEvent.change(screen.getByLabelText('ملف الموظفين'),{target:{files:[new File(['xlsx'],'employees.xlsx')]}});
    fireEvent.click(screen.getByRole('button',{name:'معاينة وفحص الأخطاء'}));
    await screen.findByText('رقم مكرر');
    expect((screen.getByRole('button',{name:'حفظ 1 موظف'})as HTMLButtonElement).disabled).toBe(true);
    expect(mock.mock.calls.some(([path])=>path==='/import/employees/commit')).toBe(false);
  });
});
