FROM python:3.7.15-bullseye

# Copied from: https://gitlab.com/nvidia/container-images/cuda/-/blob/master/dist/11.8.0/ubuntu2004/devel/Dockerfile
# Lines marked 'ADDED' show where this code was modified
ENV NV_CUDA_LIB_VERSION "11.7.1-1"

ENV NV_CUDA_CUDART_DEV_VERSION 11.7.99-1
ENV NV_NVML_DEV_VERSION 11.7.91-1
ENV NV_LIBCUSPARSE_DEV_VERSION 11.7.4.91-1
ENV NV_LIBNPP_DEV_VERSION 11.7.4.75-1
ENV NV_LIBNPP_DEV_PACKAGE libnpp-dev-11-7=${NV_LIBNPP_DEV_VERSION}

ENV NV_LIBCUBLAS_DEV_VERSION 11.10.3.66-1
ENV NV_LIBCUBLAS_DEV_PACKAGE_NAME libcublas-dev-11-7
ENV NV_LIBCUBLAS_DEV_PACKAGE ${NV_LIBCUBLAS_DEV_PACKAGE_NAME}=${NV_LIBCUBLAS_DEV_VERSION}

ENV NV_NVPROF_VERSION 11.7.101-1
ENV NV_NVPROF_DEV_PACKAGE cuda-nvprof-11-7=${NV_NVPROF_VERSION}

ENV NV_LIBNCCL_DEV_PACKAGE_NAME libnccl-dev
ENV NV_LIBNCCL_DEV_PACKAGE_VERSION 2.13.4-1
ENV NCCL_VERSION 2.13.4-1
ENV NV_LIBNCCL_DEV_PACKAGE ${NV_LIBNCCL_DEV_PACKAGE_NAME}=${NV_LIBNCCL_DEV_PACKAGE_VERSION}+cuda11.7

ENV NV_CUDA_CUDART_DEV_VERSION 11.7.99-1
ENV NV_NVML_DEV_VERSION 11.7.91-1
ENV NV_LIBCUSPARSE_DEV_VERSION 11.7.4.91-1
ENV NV_LIBNPP_DEV_VERSION 11.7.4.75-1
ENV NV_LIBNPP_DEV_PACKAGE libnpp-dev-11-7=${NV_LIBNPP_DEV_VERSION}

ENV NV_LIBCUBLAS_DEV_PACKAGE_NAME libcublas-dev-11-7
ENV NV_LIBCUBLAS_DEV_VERSION 11.10.3.66-1
ENV NV_LIBCUBLAS_DEV_PACKAGE ${NV_LIBCUBLAS_DEV_PACKAGE_NAME}=${NV_LIBCUBLAS_DEV_VERSION}

ENV NV_NVPROF_VERSION 11.7.101-1
ENV NV_NVPROF_DEV_PACKAGE cuda-nvprof-11-7=${NV_NVPROF_VERSION}

ENV NV_LIBNCCL_DEV_PACKAGE_NAME libnccl-dev
ENV NV_LIBNCCL_DEV_PACKAGE_VERSION 2.12.12-1
ENV NCCL_VERSION 2.12.12-1
ENV NV_LIBNCCL_DEV_PACKAGE ${NV_LIBNCCL_DEV_PACKAGE_NAME}=${NV_LIBNCCL_DEV_PACKAGE_VERSION}+cuda11.7

# ADDED. see: https://developer.nvidia.com/blog/updating-the-cuda-linux-gpg-repository-key/
RUN apt-key del 7fa2af80 && \
    wget https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2004/x86_64/cuda-keyring_1.0-1_all.deb && \
    dpkg -i cuda-keyring_1.0-1_all.deb

RUN apt-get update && apt-get install -y --no-install-recommends --allow-downgrades \
    libtinfo5 libncursesw5 \
    cuda-cudart-dev-11-7=${NV_CUDA_CUDART_DEV_VERSION} \
    cuda-command-line-tools-11-7=${NV_CUDA_LIB_VERSION} \
    cuda-minimal-build-11-7=${NV_CUDA_LIB_VERSION} \
    cuda-libraries-dev-11-7=${NV_CUDA_LIB_VERSION} \
    cuda-nvml-dev-11-7=${NV_NVML_DEV_VERSION} \
    ${NV_NVPROF_DEV_PACKAGE} \
    ${NV_LIBNPP_DEV_PACKAGE} \
    libcusparse-dev-11-7=${NV_LIBCUSPARSE_DEV_VERSION} \
    ${NV_LIBCUBLAS_DEV_PACKAGE} \
    ${NV_LIBNCCL_DEV_PACKAGE} \
    && rm -rf /var/lib/apt/lists/*

# Keep apt from auto upgrading the cublas and nccl packages. See https://gitlab.com/nvidia/container-images/cuda/-/issues/88
RUN apt-mark hold ${NV_LIBCUBLAS_DEV_PACKAGE_NAME} ${NV_LIBNCCL_DEV_PACKAGE_NAME}

ENV LIBRARY_PATH /usr/local/cuda/lib64/stubs
# END COPIED

RUN echo 'export PATH=/usr/local/cuda/bin:$PATH' >> ~/.bashrc && \
    echo 'export LD_LIBRARY_PATH=/usr/local/cuda/lib64/' >> ~/.bashrc && \
#    echo 'export LD_PRELOAD=/usr/local/nvidia/lib64/libnvidia-ml.so' >> ~/.bashrc && \
    . ~/.bashrc

RUN pip uninstall spacy -y && pip install spacy[cuda118]==3.4.1

